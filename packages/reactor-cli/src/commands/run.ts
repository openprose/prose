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
  ensureCompiledIR,
  buildRenderWithDefaults,
  type RunReport,
} from '../run/run-core';
import {
  callRunProject,
  type RunAdapters,
  type RunRender,
} from '../run/load-run-project';
import { buildDurableSubstrate } from '../run/substrate';
import { buildSandboxRunner } from '../run/sandbox';
import type { ConfigOverrides } from '../config';
import { loadConfig, validateStateDirTarget } from '../config';
import { hasModelKey, readModelKey } from '../env';
import {
  missingProviderKeyHint,
  resolveProviderPlan,
} from '../model/provider-plan';
import type { CompileCommandOptions } from './compile';
import { emitError } from './emit';
import {
  NOOP_TELEMETRY,
  TelemetryEvent,
  buildEventProperties,
  buildGraphProperties,
  errorCategory,
  type Telemetry,
} from '../telemetry';

import * as path from 'path';

export interface RunCommandOptions extends ConfigOverrides {
  /** Machine-readable JSON output. */
  readonly json?: boolean;
  /** Force offline mode (sets REACTOR_OFFLINE=1 for the process). */
  readonly offline?: boolean;
  /**
   * EXPERIMENT A (`--budget-tokens <n>`, opt-in): the enforced ceiling on fresh
   * tokens for this run's session. Renders dispatched past the ceiling fail
   * closed (a zero-cost `failed` receipt; the prior truth stands), so the
   * existing "any failed → exit 1" contract applies. Must be a non-negative
   * safe integer (usage error, exit 2, otherwise). Unset means unlimited.
   */
  readonly budgetTokens?: number;
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
  telemetry: Telemetry = NOOP_TELEMETRY,
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const startedAt = Date.now();
  /** Fire `reactor.run` with the bucketed shared block + graph/disposition extras. */
  const fireRun = (
    outcome: 'success' | 'failure',
    graph?: {
      nodes?: number;
      edges?: number;
      costFresh?: number;
      costReused?: number;
      dispositions?: readonly { readonly disposition: string }[];
    },
  ): void => {
    telemetry.event(
      TelemetryEvent.RUN,
      buildEventProperties(
        { command: 'run', outcome, durationMs: Date.now() - startedAt },
        buildGraphProperties({ ...(graph ?? {}), provider: config?.model.provider }),
      ),
    );
  };
  /** Fire `reactor.error` with a coarse category (never a message/stack). */
  const fireError = (err: unknown): void => {
    telemetry.event(
      TelemetryEvent.ERROR,
      buildEventProperties(
        { command: 'run', outcome: 'failure', durationMs: Date.now() - startedAt },
        { errorCategory: errorCategory(err) },
      ),
    );
  };

  const config = loadConfig({
    stateDir: options.stateDir,
    projectDir: options.projectDir,
    model: options.model,
  });
  const stateDir = config.state.dir;
  const contractsDir = path.resolve(options.projectDir ?? '.');
  const model = config.model.compile_model;

  // Resolve the provider plan (keyless). A malformed provider config is a clean
  // exit-1, not a stack later. The plan also tells us whether the live render
  // needs a CLI-built provider (custom) or the SDK default (OpenRouter).
  let providerPlan;
  try {
    providerPlan = resolveProviderPlan(config.model);
  } catch (err) {
    fireError(err);
    fireRun('failure');
    return emitError(
      write,
      options.json,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Validate the state-dir target before anything tries to mkdir it (G12) — a
  // file at the state-dir path otherwise surfaces a raw EEXIST with no guidance.
  const stateDirError = validateStateDirTarget(stateDir);
  if (stateDirError !== undefined) {
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: stateDirError }));
    } else {
      write(stateDirError);
    }
    fireError(Object.assign(new Error(stateDirError), { code: 'ENOTDIR' }));
    return 2;
  }

  // EXPERIMENT A: validate `--budget-tokens` before any work — a malformed
  // ceiling is a USAGE error (exit 2, mirroring the state-dir validation), not
  // a failed run.
  if (
    options.budgetTokens !== undefined &&
    (!Number.isSafeInteger(options.budgetTokens) || options.budgetTokens < 0)
  ) {
    const budgetError =
      `reactor run: --budget-tokens must be a non-negative integer; got ` +
      `${String(options.budgetTokens)}`;
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: budgetError }));
    } else {
      write(budgetError);
    }
    fireError(new TypeError(budgetError));
    return 2;
  }

  try {
  // 1. Ensure the IR is fresh (compile if stale).
  const ensured = await ensureCompiledIR({
    contractsDir,
    stateDir,
    model,
    ...(options.offline !== undefined ? { offline: options.offline } : {}),
    ...(options.model !== undefined ? { modelOverride: options.model } : {}),
    ...(options.testCompileOptions !== undefined
      ? { compileOptions: options.testCompileOptions }
      : {}),
  });
  if (ensured.kind === 'no-contracts') {
    fireRun('failure');
    return emitError(
      write,
      options.json,
      `reactor run: no .prose.md contracts found under ${contractsDir}`,
    );
  }
  if (ensured.kind === 'compile-failed') {
    fireRun('failure');
    return emitError(
      write,
      options.json,
      `reactor run: compile failed (the IR is stale and could not be refreshed)`,
    );
  }

  // 2. Load + re-lower the cached compiled project (KEYLESS — compileNode).
  const loaded = loadCompiledProject(stateDir);

  // 3. CONFIGURE runProject. Offline gate: the test render wiring (fake build
  //    render + projectTruthFor). Live: supply our derived projectTruthFor +
  //    contractFor (the SDK builds createAgentRender lazily from the key).
  // Persist the one-shot run's receipt trail to disk (flat
  // `<state-dir>/receipts.json`) so `reactor-devtools <state-dir>` can replay it
  // and a later `serve`/`inspect` re-opens the SAME durable trail + truth
  // (crosscheck dt-receiptspath-1: `run` formerly used in-memory storage and
  // left nothing on disk to replay).
  const adapters: RunAdapters =
    options.testAdapters ?? buildDurableSubstrate(stateDir);

  const baseRender: RunRender = options.testRender ?? {};
  // Phase 5: construct the render sandbox runner from `[sandbox]` (mode none →
  // none; docker present → workspace-scoped, network-off container; docker absent
  // → none + a surfaced note). The workspace root is the state dir (the harness
  // harvests host-side). Thread `shell_timeout_ms` onto the render's bound.
  const built = buildSandboxRunner(config.sandbox, stateDir);
  if (built.note !== undefined && options.json !== true) {
    write(`reactor run: ${built.note}`);
  }

  // Default an unset render field from the loaded IR + built sandbox: contractFor/
  // projectTruthFor so faceted producers still propagate (#2); the sandbox runner +
  // shell-timeout bound. A test render that wired its own keeps them.
  const renderWithDefaults = buildRenderWithDefaults(baseRender, loaded, {
    runner: built.runner,
    shellTimeoutMs: config.sandbox.shell_timeout_ms,
  });

  // A LIVE custom-provider render needs its key NOW (the compile-if-stale step
  // already checked it on a miss, but a warm cache jumps straight to the render).
  // Fail clean + NON-ZERO with the exact env var. Skipped for the offline gate
  // (a test render owns the body) and the default OpenRouter path.
  const liveCustomRender =
    providerPlan.custom &&
    options.testRender === undefined &&
    options.offline !== true;
  if (liveCustomRender && !hasModelKey(providerPlan.apiKeyEnv, contractsDir)) {
    fireError(new Error('missing provider key'));
    fireRun('failure');
    return emitError(write, options.json, missingProviderKeyHint(providerPlan));
  }

  // 4. Run the dumb run phase (the SDK self-mounts + bootAsync). Drain to
  //    quiescence is bootAsync's cold-miss sweep + the propagation it cascades.
  const { reactor, bootResults } = await callRunProject({
    compiled: loaded.compiled,
    adapters,
    render: renderWithDefaults,
    // Always honor the configured render model (so a non-default model id actually
    // reaches the run-phase render, not just the SDK's gemini default).
    renderModel: config.model.render_model,
    // EXPERIMENT A: thread the validated `--budget-tokens` ceiling to the SDK
    // (`RunProjectInput.budget`). Unset means unlimited — byte-identical to today.
    ...(options.budgetTokens !== undefined
      ? { budget: { maxFreshTokens: options.budgetTokens } }
      : {}),
    ...(liveCustomRender
      ? {
          providerPlan,
          apiKey: readModelKey(providerPlan.apiKeyEnv, contractsDir)!,
          providerLabel: providerPlan.provider,
        }
      : {}),
  });

  // 5. Project the boot results + the ledger receipts into the run report.
  const report = summarizeBoot(
    bootResults,
    reactor.ledger.all().map((r) => ({ node: r.node, cost: r.cost })),
  );
  emitReport(report, options, write);
  // A run with a `failed` node must exit NONZERO — a failed render is the audit
  // signal the whole pitch rests on, and CI/agents read the exit code. (The
  // documented exit table: 0 = ran clean, 1 = a node failed.)
  const anyFailed = report.dispositions.some((d) => d.disposition === 'failed');
  fireRun(anyFailed ? 'failure' : 'success', {
    nodes: loaded.ir.topology.topology.nodes.length,
    edges: loaded.ir.topology.topology.edges.length,
    costFresh: report.cost.fresh,
    costReused: report.cost.reused,
    dispositions: report.dispositions,
  });
  return anyFailed ? 1 : 0;
  } catch (err) {
    // A thrown run (e.g. a live render/provider failure inside callRunProject)
    // fires the coarse error signal, then rethrows so the top-level handler still
    // prints + exits 1 exactly as before — telemetry never changes control flow.
    fireError(err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function emitReport(
  report: RunReport,
  options: RunCommandOptions,
  write: (line: string) => void,
): void {
  if (options.json === true) {
    // Always emit a structured object — even on a no-op — so a piped `--json`
    // consumer never sees zero bytes. `ok` is false when any node failed.
    const ok = !report.dispositions.some((d) => d.disposition === 'failed');
    write(JSON.stringify({ status: 'ran', ok, ...report }));
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
  if (report.dispositions.length === 0) {
    lines.push('    (no nodes woke — nothing to reconcile)');
  } else {
    for (const d of report.dispositions) {
      lines.push(`    ${d.node.padEnd(28)} ${d.disposition}`);
    }
  }
  lines.push('');
  lines.push(`  receipts       ${report.receipts}`);
  lines.push(
    `  run cost       fresh=${report.cost.fresh} reused=${report.cost.reused}`,
  );
  if (report.dispositions.some((d) => d.disposition === 'failed')) {
    lines.push('');
    lines.push(
      '  note: a node FAILED — its prior truth stands and no successful-render ' +
        'receipt was written. The cause is usually a live render error (e.g. a ' +
        'provider 402/401); run `reactor doctor --live` to see it. `run` exits ' +
        'non-zero when any node fails.',
    );
  } else if (report.receipts === 0) {
    lines.push('');
    lines.push(
      '  note: nothing rendered. A one-shot `run` boots and drains to ' +
        'quiescence; a gateway only wakes once its connector stages an arrival. ' +
        'Stage one with `reactor trigger <gateway> --data @item.json`, or run ' +
        '`reactor serve` (which polls the configured connectors on cadence).',
    );
  }
  return lines.join('\n');
}
