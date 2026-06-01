/**
 * `reactor trigger <node> [--data <json>|@file]` (CLI plan Phase 2).
 *
 * Two paths (cli.md §5):
 *   - the RUNNING-DAEMON path (HTTP POST / enqueue onto the serve loop's
 *     serialization queue) — wired in Phase 3 when the HTTP server lands;
 *   - the ONE-SHOT MOUNT path (this command, v1): boot a transient reactor over
 *     the DURABLE substrate (the receipt persists to the same flat
 *     `<state-dir>/receipts.json` trail run/serve write), ingest the named node
 *     with a full external wake `{ source: "external", refs: [] }`, drain to
 *     quiescence, and report the dispositions.
 *
 * OFFLINE-SAFE (N2): keyless at load; the model surface is reached ONLY via
 * `callRunProject`'s dynamic import. The offline gate injects a fake render.
 *
 * `--data` is parsed (JSON inline or `@file`) and validated here; v1's one-shot
 * mount passes the external wake (the SDK wake carries no payload slot, so the
 * parsed data is reserved for the Phase-4 connector ingress and is surfaced in
 * the report rather than smuggled into the wake).
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  loadCompiledProject,
  summarizeBoot,
  type RunReport,
} from '../run/run-core';
import {
  callRunProject,
  type RunAdapters,
  type RunRender,
} from '../run/load-run-project';
import { buildDurableSubstrate } from '../run/substrate';
import { isCacheFresh, contractSetFingerprint } from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import type { ConfigOverrides } from '../config';
import { loadConfig } from '../config';
import { resolveSdk } from '../meta';
import { runCompileCommand, type CompileCommandOptions } from './compile';

/** The SDK external wake (the barrel does not export the const; build it). */
const EXTERNAL_WAKE = Object.freeze({ source: 'external', refs: [] as string[] });

export interface TriggerCommandOptions extends ConfigOverrides {
  /** The node to trigger (required). */
  readonly node: string;
  /** Inline JSON, or `@path` to a JSON file. */
  readonly data?: string;
  readonly json?: boolean;
  readonly offline?: boolean;
  /** Test seam (OFFLINE gate): substrate + fake render. */
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  readonly testCompileOptions?: CompileCommandOptions;
}

/** Run `reactor trigger`. Returns the process exit code. */
export async function runTriggerCommand(
  options: TriggerCommandOptions,
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  if (typeof options.node !== 'string' || options.node.length === 0) {
    return emitError('reactor trigger: a node id is required', options, write);
  }

  // Parse --data (inline JSON or @file) up front — a bad payload fails fast.
  let parsedData: unknown;
  if (options.data !== undefined) {
    try {
      parsedData = parseData(options.data);
    } catch (err) {
      return emitError(
        `reactor trigger: invalid --data (${String((err as Error).message)})`,
        options,
        write,
      );
    }
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

  // Ensure IR fresh (compile if stale).
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    return emitError(
      `reactor trigger: no .prose.md contracts found under ${contractsDir}`,
      options,
      write,
    );
  }
  const setFingerprint = contractSetFingerprint(images);
  if (!isCacheFresh(stateDir, setFingerprint, sdkVersion, model)) {
    const code = await runCompileCommand(
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
      () => {},
    );
    if (code !== 0) {
      return emitError('reactor trigger: compile failed (IR stale)', options, write);
    }
  }

  // Load + re-lower (KEYLESS).
  const loaded = loadCompiledProject(stateDir);
  if (loaded.ir.topology.topology.nodes.every((n) => n.node !== options.node)) {
    return emitError(
      `reactor trigger: node '${options.node}' is not in the compiled topology`,
      options,
      write,
    );
  }

  // One-shot mount: boot a transient reactor over the durable substrate so the
  // injected event's receipt persists to the SAME flat `<state-dir>/receipts.json`
  // trail that `serve`/`run` write and `reactor-devtools <state-dir>` replays
  // (crosscheck dt-receiptspath-1).
  const adapters: RunAdapters =
    options.testAdapters ?? buildDurableSubstrate(stateDir);
  const baseRender: RunRender = options.testRender ?? {};
  const render: RunRender = {
    ...baseRender,
    contractFor: baseRender.contractFor ?? ((node) => loaded.contractFor(node)),
    projectTruthFor:
      baseRender.projectTruthFor ?? ((node) => loaded.projectTruthFor(node)),
  };

  const { reactor } = await callRunProject({
    compiled: loaded.compiled,
    adapters,
    render,
  });

  // Ingest the named node with the full external wake, drain to quiescence.
  const dag = (
    reactor as {
      dag: {
        ingestAsync: (
          node: string,
          wake: unknown,
        ) => Promise<readonly { node: string; disposition: string }[]>;
      };
    }
  ).dag;
  const results = await dag.ingestAsync(options.node, EXTERNAL_WAKE);

  const report = summarizeBoot(
    results,
    reactor.ledger.all().map((r) => ({ node: r.node, cost: r.cost })),
  );
  emitReport(report, parsedData, options, write);
  return 0;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/** Parse `--data`: `@path` reads a JSON file; otherwise inline JSON. */
function parseData(raw: string): unknown {
  if (raw.startsWith('@')) {
    const file = raw.slice(1);
    const text = fs.readFileSync(file, 'utf8');
    return JSON.parse(text);
  }
  return JSON.parse(raw);
}

function emitError(
  message: string,
  options: TriggerCommandOptions,
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
  data: unknown,
  options: TriggerCommandOptions,
  write: (line: string) => void,
): void {
  if (options.json === true) {
    write(
      JSON.stringify({
        status: 'triggered',
        ...report,
        ...(data !== undefined ? { data } : {}),
      }),
    );
    return;
  }
  const lines: string[] = ['reactor trigger', ''];
  lines.push('  dispositions:');
  for (const d of report.dispositions) {
    lines.push(`    ${d.node.padEnd(28)} ${d.disposition}`);
  }
  lines.push('');
  lines.push(`  receipts       ${report.receipts}`);
  lines.push(
    `  run cost       fresh=${report.cost.fresh} reused=${report.cost.reused}`,
  );
  write(lines.join('\n'));
}
