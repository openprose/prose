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
 * `--data` is parsed (JSON inline or `@file`) and validated here. The SDK `Wake`
 * shape carries NO payload slot (`{ source, refs }` only — architecture.md §6.1),
 * so a payload cannot be smuggled into the wake. The architecturally-sanctioned
 * delivery is the SAME staging mechanism the connector ingress uses (cli.md §6.1):
 * augment the triggered node's topology with a phantom-ingress edge, STAGE the
 * `--data` into that ingress inbox (moving the node's input fingerprint), then
 * ingest — so the wake is a memo-MISS and the node re-renders reading the staged
 * payload. With NO `--data`, the trigger is a bare external wake (unchanged).
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
import {
  augmentTopologyWithIngress,
  buildStageArrival,
  triggerArrivalId,
  EXTERNAL_WAKE,
  type StageStore,
  type StageLedger,
} from '../run/connectors';
import { isCacheFresh, contractSetFingerprint } from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import type { ConfigOverrides } from '../config';
import { loadConfig, validateStateDirTarget } from '../config';
import { resolveSdk } from '../meta';
import { runCompileCommand, type CompileCommandOptions } from './compile';
import { emitError } from './emit';

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
    return emitError(write, options.json, 'reactor trigger: a node id is required');
  }

  // Parse --data (inline JSON or @file) up front — a bad payload fails fast.
  let parsedData: unknown;
  if (options.data !== undefined) {
    try {
      parsedData = parseData(options.data);
    } catch (err) {
      return emitError(
        write,
        options.json,
        `reactor trigger: invalid --data (${String((err as Error).message)})`,
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

  // Validate the state-dir target before the substrate mkdir's it (G12) — a file
  // at the state-dir path otherwise surfaces a raw EEXIST with no guidance.
  const stateDirError = validateStateDirTarget(stateDir);
  if (stateDirError !== undefined) {
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: stateDirError }));
    } else {
      write(stateDirError);
    }
    return 2;
  }

  // Ensure IR fresh (compile if stale).
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    return emitError(
      write,
      options.json,
      `reactor trigger: no .prose.md contracts found under ${contractsDir}`,
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
      return emitError(write, options.json, 'reactor trigger: compile failed (IR stale)');
    }
  }

  // Load + re-lower (KEYLESS).
  const loaded = loadCompiledProject(stateDir);
  if (loaded.ir.topology.topology.nodes.every((n) => n.node !== options.node)) {
    return emitError(
      write,
      options.json,
      `reactor trigger: node '${options.node}' is not in the compiled topology`,
    );
  }

  // One-shot mount: boot a transient reactor over the durable substrate so the
  // injected event's receipt persists to the SAME flat `<state-dir>/receipts.json`
  // trail that `serve`/`run` write and `reactor-devtools <state-dir>` replays
  // (crosscheck dt-receiptspath-1).
  //
  // PAYLOAD DELIVERY (B3): the SDK `Wake` carries no payload, so when `--data` is
  // given we deliver it via the connector STAGING mechanism — give the node a
  // phantom-ingress edge so a staged arrival moves its input fingerprint. The
  // compiled topology is augmented BEFORE the mount (so the reconciler resolves
  // the ingress input), then we stage the parsed `--data` and ingest, which is a
  // memo-MISS and re-renders the node reading the staged payload. With NO `--data`
  // the topology + wake are unchanged (a bare external wake).
  const hasData = options.data !== undefined;
  const compiledForMount = hasData
    ? {
        ...loaded.compiled,
        reconcilerTopology: augmentTopologyWithIngress(
          loaded.compiled.reconcilerTopology,
          [{ node: options.node, source_id: options.node }],
        ),
      }
    : loaded.compiled;

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
    compiled: compiledForMount,
    adapters,
    render,
  });

  // When `--data` is given, STAGE it into the node's phantom-ingress inbox so the
  // upcoming ingest is a memo-miss that delivers the payload (B3). `buildStageArrival`
  // appends the item to the ingress source's published inbox, commits it (moving the
  // ingress atomic fingerprint), and appends an EXTERNAL receipt — which moves the
  // node's `input_fingerprints`. The arrival id is content-stable so a re-trigger of
  // the same payload dedups at the inbox (append-style stage).
  if (hasData) {
    // The typed handle surfaces `store`/`ledger` first-class — no cast. The
    // `StageStore`/`StageLedger` params are narrow structural views the SDK
    // store/ledger satisfy.
    const stage = buildStageArrival(
      options.node,
      reactor.store as StageStore,
      reactor.ledger as StageLedger,
    );
    stage({ id: triggerArrivalId(parsedData), item: parsedData });
  }

  // Ingest the named node with the full external wake, drain to quiescence. The
  // handle's async-by-default `ingest` IS the former `dag.ingestAsync` — no `.dag`
  // cast.
  const results = await reactor.ingest(options.node, { wake: EXTERNAL_WAKE });

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
