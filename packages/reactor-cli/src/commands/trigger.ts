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
 * delivery is the SAME staging mechanism the connector ingress uses (cli.md §6.1),
 * and it is only valid for external gateway nodes: augment the gateway topology
 * with a phantom-ingress edge, STAGE the `--data` into that ingress inbox
 * (moving the gateway's input fingerprint), then ingest. With NO `--data`, the
 * trigger is a bare external wake for any compiled node.
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
  renderDecodingInputs,
  type RunAdapters,
  type RunProjectFn,
  type RunRender,
} from '../run/load-run-project';
import { hasModelKey, readModelKey } from '../env';
import {
  missingProviderKeyHint,
  resolveProviderPlan,
} from '../model/provider-plan';
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
import {
  NOOP_TELEMETRY,
  TelemetryEvent,
  buildEventProperties,
  buildGraphProperties,
  errorCategory,
  type Telemetry,
} from '../telemetry';

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
  /**
   * Test seam: inject the `runProject` implementation so a test can CAPTURE the
   * exact render config trigger hands it (prove the provider/model threading)
   * WITHOUT the dynamic import + a real provider. Mirrors `callRunProject`'s
   * own seam.
   */
  readonly testRunProjectImpl?: RunProjectFn;
}

/** Run `reactor trigger`. Returns the process exit code. */
export async function runTriggerCommand(
  options: TriggerCommandOptions,
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
  telemetry: Telemetry = NOOP_TELEMETRY,
): Promise<number> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const startedAt = Date.now();
  // Captured via a mutable holder (not the later `const config`) so an EARLY fire
  // — before config is resolved — never trips the const's temporal-dead-zone.
  let providerClassInput: string | undefined;
  /** Fire `reactor.trigger` with the bucketed shared block + graph/disposition extras. */
  const fireTrigger = (
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
      TelemetryEvent.TRIGGER,
      buildEventProperties(
        { command: 'trigger', outcome, durationMs: Date.now() - startedAt },
        buildGraphProperties({ ...(graph ?? {}), provider: providerClassInput }),
      ),
    );
  };
  /** Fire `reactor.error` with a coarse category (never a message/stack). */
  const fireError = (err: unknown): void => {
    telemetry.event(
      TelemetryEvent.ERROR,
      buildEventProperties(
        { command: 'trigger', outcome: 'failure', durationMs: Date.now() - startedAt },
        { errorCategory: errorCategory(err) },
      ),
    );
  };

  if (typeof options.node !== 'string' || options.node.length === 0) {
    fireTrigger('failure');
    return emitError(write, options.json, 'reactor trigger: a node id is required');
  }

  // Parse --data (inline JSON or @file) up front — a bad payload fails fast.
  let parsedData: unknown;
  if (options.data !== undefined) {
    try {
      parsedData = parseData(options.data);
    } catch (err) {
      fireError(err);
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
  providerClassInput = config.model.provider;
  const stateDir = config.state.dir;
  const contractsDir = path.resolve(options.projectDir ?? '.');
  const model = config.model.compile_model;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  // Resolve the provider plan (keyless) BEFORE any compile/staging side effect —
  // a malformed provider config is a clean exit-1 naming the problem, mirroring
  // `run`. Left to the compile-if-stale step it would surface as the generic
  // 'compile failed (IR stale)' (trigger discards the compile's own output).
  let providerPlan;
  try {
    providerPlan = resolveProviderPlan(config.model);
  } catch (err) {
    fireError(err);
    fireTrigger('failure');
    return emitError(
      write,
      options.json,
      err instanceof Error ? err.message : String(err),
    );
  }

  // Validate the state-dir target before the substrate mkdir's it (G12) — a file
  // at the state-dir path otherwise surfaces a raw EEXIST with no guidance.
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

  try {
  // Ensure IR fresh (compile if stale).
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    fireTrigger('failure');
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
      fireTrigger('failure');
      return emitError(write, options.json, 'reactor trigger: compile failed (IR stale)');
    }
  }

  // Load + re-lower (KEYLESS).
  const loaded = loadCompiledProject(stateDir);
  const triggerNode = loaded.ir.topology.topology.nodes.find((n) => n.node === options.node);
  if (triggerNode === undefined) {
    fireTrigger('failure');
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
  // given we deliver it via the connector STAGING mechanism. That delivery is
  // only valid for external gateway nodes. A non-gateway trigger may still wake
  // the node, but it cannot receive a hidden body; model the payload as gateway
  // maintained truth and let downstream nodes subscribe via Requires.
  const hasData = options.data !== undefined;
  if (hasData && triggerNode.wake_source !== 'external') {
    fireTrigger('failure');
    return emitError(
      write,
      options.json,
      `reactor trigger: --data can only be delivered to an external gateway node; ` +
        `'${options.node}' has wake_source '${triggerNode.wake_source}'. ` +
        `Trigger a gateway and connect downstream data with Requires/Maintains.`,
    );
  }
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

  // A LIVE custom-provider render needs its key NOW (the compile-if-stale step
  // already checked it on a miss, but a warm cache jumps straight to the render).
  // Fail clean + NON-ZERO with the exact env var BEFORE any render attempt.
  // Skipped for the offline gate (a test render owns the body) and the default
  // OpenRouter path — exactly `run`'s guard.
  const liveCustomRender =
    providerPlan.custom &&
    options.testRender === undefined &&
    options.offline !== true;
  if (liveCustomRender && !hasModelKey(providerPlan.apiKeyEnv, contractsDir)) {
    fireError(new Error('missing provider key'));
    fireTrigger('failure');
    return emitError(write, options.json, missingProviderKeyHint(providerPlan));
  }

  const { reactor } = await callRunProject(
    {
      compiled: compiledForMount,
      adapters,
      render,
      // Always honor the configured render model + decoding knobs, and inject
      // the CLI-built provider for a custom plan — the same threading as
      // `run`/`serve`, so a trigger render hits the configured endpoint instead
      // of silently falling back to the SDK's OpenRouter default.
      renderModel: config.model.render_model,
      ...renderDecodingInputs(config.model),
      ...(liveCustomRender
        ? {
            providerPlan,
            apiKey: readModelKey(providerPlan.apiKeyEnv, contractsDir)!,
            providerLabel: providerPlan.provider,
          }
        : {}),
    },
    options.testRunProjectImpl,
  );

  // When `--data` is given, STAGE it into the gateway's phantom-ingress inbox so
  // the upcoming ingest is a memo-miss that delivers the payload (B3).
  // `buildStageArrival` appends the item to the ingress source's published inbox,
  // commits it (moving the ingress atomic fingerprint), and appends an EXTERNAL
  // receipt — which moves the gateway's `input_fingerprints`. The arrival id is
  // content-stable so a re-trigger of the same payload dedups at the inbox.
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
  const anyFailed = report.dispositions.some((d) => d.disposition === 'failed');
  fireTrigger(anyFailed ? 'failure' : 'success', {
    nodes: loaded.ir.topology.topology.nodes.length,
    edges: loaded.ir.topology.topology.edges.length,
    costFresh: report.cost.fresh,
    costReused: report.cost.reused,
    dispositions: report.dispositions,
  });
  // A trigger with a `failed` node exits NONZERO, matching `run`: CI and agents
  // read the exit code, and a failed render is the audit signal. (Previously
  // trigger returned 0 even when the triggered render failed.)
  return anyFailed ? 1 : 0;
  } catch (err) {
    // A thrown trigger (e.g. a live render/provider failure) fires the coarse
    // error signal, then rethrows so the top-level handler prints + exits 1 —
    // telemetry never alters control flow.
    fireError(err);
    throw err;
  }
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
    if (d.reason !== undefined) {
      lines.push(`      reason: ${d.reason}`);
    }
  }
  lines.push('');
  lines.push(`  receipts       ${report.receipts}`);
  lines.push(
    `  run cost       fresh=${report.cost.fresh} reused=${report.cost.reused}`,
  );
  write(lines.join('\n'));
}
