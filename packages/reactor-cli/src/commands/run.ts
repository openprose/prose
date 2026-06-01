/**
 * `reactor run` — the one-shot run phase (CLI plan Phase 2). Ensure the IR is
 * fresh (compile if stale), load + re-lower the cached compiled project
 * (keyless), CONFIGURE `runProject` (the SDK self-mounts + boots), drain to
 * quiescence, print per-node dispositions + cost, and exit.
 *
 * OFFLINE-SAFE (N2): this module imports only the keyless run-core + config +
 * compile command at load scope. The model-bearing `runProject` is reached ONLY
 * via the dynamic import inside `callRunProject` (run/load-run-project.ts). The
 * OFFLINE gate injects a fake `buildRender` + `projectTruthFor` via the test
 * seam; a LIVE run leaves them unset (the SDK builds `createAgentRender` lazily).
 *
 * The CLI CONFIGURES `runProject`; it never hand-mounts (correction #3 / N3).
 */

import {
  loadCompiledProject,
  summarizeBoot,
  type ContractView,
  type ProjectTruthProjection,
  type RunReport,
} from '../run/run-core';
import {
  callRunProject,
  type RunAdapters,
  type RunRender,
} from '../run/load-run-project';
import { buildEphemeralSubstrate } from '../run/substrate';
import { buildSandboxRunner } from '../run/sandbox';
import { isCacheFresh, contractSetFingerprint } from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import type { ConfigOverrides } from '../config';
import { loadConfig } from '../config';
import { resolveSdk } from '../meta';
import { runCompileCommand, type CompileCommandOptions } from './compile';

import * as path from 'path';

export interface RunCommandOptions extends ConfigOverrides {
  /** Machine-readable JSON output. */
  readonly json?: boolean;
  /** Force offline mode (sets REACTOR_OFFLINE=1 for the process). */
  readonly offline?: boolean;
  /**
   * Test seam (OFFLINE gate): inject the durable substrate + the fake render
   * wiring so the run is hermetic (no model, no network). When set, `run` skips
   * its own compile-if-stale (the caller has populated the cache) unless
   * {@link testCompileOptions} is also provided, and uses these adapters/render
   * instead of building the live ones.
   */
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  /**
   * Test seam: when the cache is stale, compile via these options (the offline
   * gate's per-step fake providers). Mirrors the compile command's seam.
   */
  readonly testCompileOptions?: CompileCommandOptions;
}

/** Run `reactor run`. Returns the process exit code. */
export async function runRunCommand(
  options: RunCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const config = loadConfig({
    stateDir: options.stateDir,
    projectDir: options.projectDir,
    model: options.model,
  });
  const stateDir = config.state.dir;
  const contractsDir = path.resolve(options.projectDir ?? '.');
  const model = config.model.compile_model;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  // 1. Ensure the IR is fresh (compile if stale). Compute the contract-set fp
  //    (keyless) and compare to the cached manifest. A stale cache → compile.
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    return emitError(
      `reactor run: no .prose.md contracts found under ${contractsDir}`,
      options,
      write,
    );
  }
  const setFingerprint = contractSetFingerprint(images);
  const fresh = isCacheFresh(stateDir, setFingerprint, sdkVersion, model);

  if (!fresh) {
    const compileCode = await runCompileCommand(
      {
        ...(options.stateDir !== undefined ? { stateDir: options.stateDir } : {}),
        ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
        ...(options.model !== undefined ? { model: options.model } : {}),
        ...(options.offline !== undefined ? { offline: options.offline } : {}),
        json: true,
        ...(options.testCompileOptions?.testProviders !== undefined
          ? { testProviders: options.testCompileOptions.testProviders }
          : {}),
        ...(options.testCompileOptions?.testSkill !== undefined
          ? { testSkill: options.testCompileOptions.testSkill }
          : {}),
      },
      // Swallow the compile report's lines (we print the run report below).
      () => {},
    );
    if (compileCode !== 0) {
      return emitError(
        `reactor run: compile failed (the IR is stale and could not be refreshed)`,
        options,
        write,
      );
    }
  }

  // 2. Load + re-lower the cached compiled project (KEYLESS — compileNode).
  const loaded = loadCompiledProject(stateDir);

  // 3. CONFIGURE runProject. Offline gate: the test render wiring (fake build
  //    render + projectTruthFor). Live: supply our derived projectTruthFor +
  //    contractFor (the SDK builds createAgentRender lazily from the key).
  const adapters: RunAdapters =
    options.testAdapters ?? buildEphemeralSubstrate(stateDir);

  const render: RunRender = options.testRender ?? {
    contractFor: (node: string): ContractView => loaded.contractFor(node),
    projectTruthFor: (node: string): ProjectTruthProjection =>
      loaded.projectTruthFor(node),
  };
  // Phase 5: construct the render sandbox runner from `[sandbox]` (mode none →
  // none; docker present → workspace-scoped, network-off container; docker absent
  // → none + a surfaced note). The workspace root is the state dir (the harness
  // harvests host-side). Thread `shell_timeout_ms` onto the render's bound. A
  // test render that already wired its own sandbox/shellTimeoutMs keeps them.
  const built = buildSandboxRunner(config.sandbox, stateDir);
  if (built.note !== undefined && options.json !== true) {
    write(`reactor run: ${built.note}`);
  }

  // If the offline gate handed a render that omits projectTruthFor/contractFor,
  // fill them from the loaded IR so faceted producers still propagate (#2).
  const renderWithDefaults: RunRender = {
    ...render,
    contractFor: render.contractFor ?? ((node) => loaded.contractFor(node)),
    projectTruthFor:
      render.projectTruthFor ?? ((node) => loaded.projectTruthFor(node)),
    ...(render.sandbox === undefined && built.runner !== undefined
      ? { sandbox: built.runner }
      : {}),
    ...(render.shellTimeoutMs === undefined
      ? { shellTimeoutMs: config.sandbox.shell_timeout_ms }
      : {}),
  };

  // 4. Run the dumb run phase (the SDK self-mounts + bootAsync). Drain to
  //    quiescence is bootAsync's cold-miss sweep + the propagation it cascades.
  const { reactor, bootResults } = await callRunProject({
    compiled: loaded.compiled,
    adapters,
    render: renderWithDefaults,
  });

  // 5. Project the boot results + the ledger receipts into the run report.
  const report = summarizeBoot(
    bootResults,
    reactor.ledger.all().map((r) => ({ node: r.node, cost: r.cost })),
  );
  emitReport(report, options, write);
  return 0;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function emitError(
  message: string,
  options: RunCommandOptions,
  write: (line: string) => void,
): number {
  if (options.json === true) {
    write(JSON.stringify({ status: 'error', message }));
  } else {
    write(message);
  }
  return 1;
}

function emitReport(
  report: RunReport,
  options: RunCommandOptions,
  write: (line: string) => void,
): void {
  if (options.json === true) {
    write(JSON.stringify({ status: 'ran', ...report }));
    return;
  }
  write(formatRunReport(report));
}

/** Render a human-readable run report (cli.md §5). */
export function formatRunReport(report: RunReport): string {
  const lines: string[] = [];
  lines.push('reactor run');
  lines.push('');
  lines.push('  dispositions:');
  for (const d of report.dispositions) {
    lines.push(`    ${d.node.padEnd(28)} ${d.disposition}`);
  }
  lines.push('');
  lines.push(`  receipts       ${report.receipts}`);
  lines.push(
    `  run cost       fresh=${report.cost.fresh} reused=${report.cost.reused}`,
  );
  return lines.join('\n');
}
