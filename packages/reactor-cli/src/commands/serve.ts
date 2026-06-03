/**
 * `reactor serve` (single reactor) — the durable daemon.
 *
 * Builds the DURABLE substrate (system clock + filesystem storage as the flat
 * `<state-dir>/receipts.json` + filesystem world-model under `<state-dir>/world-models`),
 * CONFIGURES `runProject` (which self-mounts + runs the boot cold-miss sweep),
 * then runs the driver loop behind a PER-REACTOR serialization queue: the
 * continuity poll + every ingress (`trigger`/HTTP) enqueue onto ONE async-serial
 * executor, so at most one `drainAsync` is in flight per reactor.
 *
 * Continuity: a single `createAsyncContinuityScheduler` armed once, then polled
 * on a FLAT `--poll-interval` cadence (default 60s). `readFreshness` is OPT-IN per
 * project and the default arms nothing (nothing writes `valid_until` by default;
 * the offline gate injects a fake reader), so the loop sleeps a fixed interval
 * rather than to the soonest armed `next_self_recheck`.
 *
 * Graceful shutdown: SIGTERM/SIGINT → stop arming new work, drain the in-flight
 * queue, then resolve (the SDK keeps no process alive; this is the CLI's).
 *
 * OFFLINE-SAFE: keyless at load (run-core + continuity scheduler are on the root
 * barrel); the model surface is reached ONLY via `callRunProject`'s dynamic
 * import. The offline gate drives the handle directly with a fake render; a live
 * `serve` builds the substrate and blocks on the loop.
 */

import type { NodeFreshnessReader, Wake } from '@openprose/reactor';

import {
  loadCompiledProject,
  type ContractView,
  type ProjectTruthProjection,
} from '../run/run-core';
import {
  callRunProject,
  type AssembledReactorLike,
  type RunAdapters,
  type RunRender,
} from '../run/load-run-project';
import { buildDurableSubstrate } from '../run/substrate';
import { buildSandboxRunner } from '../run/sandbox';
import { createSerialQueue, type SerialQueue } from '../run/serial-queue';
import { rollupCost, formatCostLine, type CostRollup } from '../run/cost';
import { bootHost, type PerReactorTestSeam } from '../run/host';
import {
  startHttpServer,
  DEFAULT_HTTP_HOST,
  type HttpServerHandle,
} from '../run/http-server';
import {
  augmentTopologyWithIngress,
  buildStageArrival,
  loadConnectorPlugin,
  resolveGatewayPoller,
  triggerArrivalId,
  EXTERNAL_WAKE,
  type ConnectorFetch,
  type GatewayPollOutcome,
  type ResolvedGatewayPoller,
  type StageStore,
  type StageLedger,
  type RegistryStorage,
  type GatewayRuntime,
} from '../run/connectors';
import { isCacheFresh, contractSetFingerprint } from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import type { ConfigOverrides, GatewayConfig, SandboxConfig } from '../config';
import { loadConfig, validateStateDirTarget } from '../config';
import { hasModelKey, readModelKey } from '../env';
import {
  missingProviderKeyHint,
  resolveProviderPlan,
  type ProviderPlan,
} from '../model/provider-plan';
import { resolveSdk } from '../meta';
import { runCompileCommand, type CompileCommandOptions } from './compile';
import {
  NOOP_TELEMETRY,
  TelemetryEvent,
  bucketCount,
  bucketMs,
  buildEventProperties,
  errorCategory,
  type Telemetry,
} from '../telemetry';

import * as path from 'path';

/** A node freshness reader (SDK `NodeFreshnessReader`): (node) => schedule|null. */
export type FreshnessReader = (node: string) => unknown;

/** A running single-reactor daemon handle (for tests + the driver loop). */
export interface ServeHandle {
  /** The reactor's name (the HTTP namespace; `"default"` for a single-reactor host). */
  readonly name: string;
  /** The assembled, booted reactor. */
  readonly reactor: AssembledReactorLike;
  /** The per-reactor serialization queue every ingress + poll enqueues onto. */
  readonly queue: SerialQueue;
  /** The node ids in this reactor's compiled topology (for HTTP validation). */
  readonly nodes: readonly string[];
  /**
   * Enqueue ONE continuity poll at `now` (ISO). Serialized behind the queue, so
   * it never overlaps an in-flight drain. Returns once the poll (+ any
   * propagation it drove) has settled.
   */
  readonly pollOnce: (now: string) => Promise<void>;
  /**
   * Enqueue ONE poll across EVERY configured gateway at `now`, behind the same
   * per-reactor serialization queue: fetch → extract → stage each NEW arrival into
   * the gateway's phantom-ingress truth → wake the gateway → persist the advanced
   * idempotency cursor. Serialized, so a gateway poll never overlaps a continuity
   * poll / trigger / another gateway poll. Returns the per-gateway outcomes (the
   * new vs. deduped arrival ids).
   */
  readonly pollGatewaysOnce: (now: string) => Promise<readonly GatewayPollOutcome[]>;
  /** The configured gateway node ids (for HTTP/observability; empty when none). */
  readonly gatewayNodes: readonly string[];
  /**
   * Enqueue an external trigger of `node` (the running-daemon path). Serialized.
   * Passes the SDK external wake `{ source: "external", refs: [] }`. When `data`
   * is supplied AND the node is a configured gateway, the data is STAGED into the
   * node's ingress inbox so it actually reaches the render; the returned
   * `dataDelivered` reports whether staging happened.
   */
  readonly trigger: (
    node: string,
    opts?: { wake?: Wake; data?: unknown },
  ) => Promise<TriggerOutcome>;
  /** This reactor's current cost rollup, read off its ledger. */
  readonly cost: () => CostRollup;
  /** Drain the queue to idle then resolve (graceful shutdown). */
  readonly shutdown: () => Promise<void>;
}

/** The resolved inputs to boot ONE reactor handle (single- or multi-reactor). */
export interface BootReactorInput {
  /** The reactor's name (`"default"` single; the `reactors[].name` otherwise). */
  readonly name: string;
  /** The absolute contracts directory. */
  readonly contractsDir: string;
  /** The absolute, isolated state directory. */
  readonly stateDir: string;
  /** The compile-model id (the cache key component). */
  readonly model: string;
  /** Force offline (sets REACTOR_OFFLINE=1). */
  readonly offline?: boolean;
  /** A model override applied to compile-if-stale. */
  readonly modelOverride?: string;
  /**
   * The keyless provider plan for a CUSTOM (non-default) provider, resolved by the
   * caller from the top-level `model:` config. When present (with {@link apiKey}),
   * the live render points at the configured endpoint. Omitted on the default
   * OpenRouter path and the offline gate.
   */
  readonly providerPlan?: ProviderPlan;
  /** The resolved API key for {@link providerPlan}. Required when it is set. */
  readonly apiKey?: string;
  /**
   * The configured render model id (`model.render_model`). Threaded into the
   * render so the run phase uses it rather than the SDK's gemini default —
   * required for a custom provider whose endpoint 404s on the default id.
   */
  readonly renderModel?: string;
  /**
   * The reactor's `[sandbox]` config. Drives the workspace-scoped render sandbox
   * runner + the per-command shell timeout. Omitted → the `mode: none` default (no
   * runner; bounded LocalShell).
   */
  readonly sandbox?: SandboxConfig;
  /**
   * This reactor's external-driven gateways. Each is consumed as a connector
   * (fetch + extract + stage) with a durable idempotency cursor; the topology is
   * augmented with a phantom-ingress edge per gateway so a staged arrival moves the
   * gateway's input fingerprint.
   */
  readonly gateways?: readonly GatewayConfig[];
  /**
   * Test seam: a FAKE connector fetch that replaces every gateway's real I/O with
   * canned items — keyed by source id, so distinct gateways can return distinct
   * batches. Hermetic (no network).
   */
  readonly testGatewayFetch?: (sourceId: string) => ConnectorFetch;
  /** Test seam: the substrate + render. */
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  readonly testReadFreshness?: FreshnessReader;
  readonly testCompileOptions?: CompileCommandOptions;
}

export interface ServeCommandOptions extends ConfigOverrides {
  readonly json?: boolean;
  readonly offline?: boolean;
  /** The continuity poll cadence ceiling (ms). Default 60_000. */
  readonly pollIntervalMs?: number;
  /** Across-reactor worker-pool bound (`--concurrency N`). Default 1. */
  readonly concurrency?: number;
  /** Bind a tiny HTTP server on this port (`--http <port>`). */
  readonly httpPort?: number;
  /** Bind address for the HTTP server (`--host`); default loopback (127.0.0.1). */
  readonly httpHost?: string;
  /** Test seam (OFFLINE gate): the durable/fake substrate + render wiring. */
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  /** Test seam: a fake `readFreshness` (opt-in; the gate injects one). */
  readonly testReadFreshness?: FreshnessReader;
  /** Test seam: compile-if-stale providers (offline). */
  readonly testCompileOptions?: CompileCommandOptions;
  /**
   * Test seam: a FAKE connector fetch keyed by source id, threaded onto the
   * single-reactor `bootServe` gateway path (no network).
   */
  readonly testGatewayFetch?: (sourceId: string) => ConnectorFetch;
  /** Test seam: when true, return the handle instead of blocking on the loop. */
  readonly returnHandle?: boolean;
  /** Test seam: per-reactor wiring keyed by name (multi-reactor host). */
  readonly testSeams?: Readonly<Record<string, PerReactorTestSeam>>;
  /** Test seam: when true, boot the host + HTTP then return (drive them directly). */
  readonly returnHost?: boolean;
  /** Test seam: receives the HTTP handle once bound (with `returnHost`). */
  readonly onHttpReady?: (http: HttpServerHandle | undefined) => void;
}

/** The outcome of a running-daemon trigger: whether a `--data` body was staged. */
export interface TriggerOutcome {
  /** True when a supplied trigger body was staged into the node's ingress. */
  readonly dataDelivered: boolean;
}

/**
 * Boot ONE reactor handle from already-RESOLVED inputs (the shared core of both
 * the single-reactor `bootServe` and the multi-reactor host). Ensure IR fresh,
 * configure + boot `runProject`, wire the continuity scheduler behind a
 * PER-REACTOR serialization queue, and return a {@link ServeHandle}. The handle
 * is ISOLATED: its own state-dir, substrate, schedule, and serialization queue.
 */
export async function bootReactorHandle(
  input: BootReactorInput,
): Promise<ServeHandle> {
  if (input.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const { contractsDir, stateDir, model } = input;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  // Validate the state-dir target before the substrate mkdir's it. A file at the
  // state-dir path otherwise surfaces a raw EEXIST with no guidance. Tag the error
  // so `runServeCommand` maps it to the usage exit code (2), not the generic
  // boot-failure 1.
  const stateDirError = validateStateDirTarget(stateDir);
  if (stateDirError !== undefined) {
    throw Object.assign(new Error(stateDirError), { reactorCliUsageError: true });
  }

  // 1. Ensure the IR is fresh (compile if stale).
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    throw new Error(
      `reactor serve: no .prose.md contracts found under ${contractsDir} (reactor "${input.name}")`,
    );
  }
  const setFingerprint = contractSetFingerprint(images);
  if (!isCacheFresh(stateDir, setFingerprint, sdkVersion, model)) {
    const code = await runCompileCommand(
      {
        stateDir,
        projectDir: contractsDir,
        ...(input.modelOverride !== undefined ? { model: input.modelOverride } : {}),
        ...(input.offline !== undefined ? { offline: input.offline } : {}),
        json: true,
        ...(input.testCompileOptions?.testProviders !== undefined
          ? { testProviders: input.testCompileOptions.testProviders }
          : {}),
        ...(input.testCompileOptions?.testSkill !== undefined
          ? { testSkill: input.testCompileOptions.testSkill }
          : {}),
      },
      () => {},
    );
    if (code !== 0) {
      throw new Error(
        `reactor serve: compile failed (IR stale, refresh failed) for reactor "${input.name}"`,
      );
    }
  }

  // 2. Load + re-lower (KEYLESS).
  const loaded = loadCompiledProject(stateDir);

  // AUGMENT the loaded topology with a phantom-ingress edge per configured
  // gateway, so a staged arrival moves the gateway's input fingerprint. The gateway
  // itself is the real, NAMED, mounted Forme node; the phantom ingress is an
  // unmounted edge producer the connector's staged receipts move (it is never
  // seeded/rendered). This rewrites only the reconcilerTopology the SDK mounts —
  // the cached IR on disk is untouched.
  const gateways = input.gateways ?? [];
  const compiledForRun =
    gateways.length === 0
      ? loaded.compiled
      : {
          ...loaded.compiled,
          reconcilerTopology: augmentTopologyWithIngress(
            loaded.compiled.reconcilerTopology,
            gateways,
          ),
        };

  // 3. Build the DURABLE substrate (or the test substrate) + render wiring.
  const adapters: RunAdapters =
    input.testAdapters ?? buildDurableSubstrate(stateDir);
  const baseRender: RunRender = input.testRender ?? {};
  // Construct the render sandbox runner from `[sandbox]` (mode none → none; docker
  // present → workspace-scoped network-off container; docker absent → none + a
  // note). The workspace root is the reactor's isolated state dir (the harness
  // harvests host-side). Thread `shell_timeout_ms` onto the render bound.
  const sandboxConfig: SandboxConfig =
    input.sandbox ?? { mode: 'none', shell_timeout_ms: 300_000 };
  const built = buildSandboxRunner(sandboxConfig, stateDir);
  const render: RunRender = {
    ...baseRender,
    contractFor:
      baseRender.contractFor ?? ((node) => loaded.contractFor(node) as ContractView),
    projectTruthFor:
      baseRender.projectTruthFor ??
      ((node) => loaded.projectTruthFor(node) as ProjectTruthProjection),
    ...(baseRender.sandbox === undefined && built.runner !== undefined
      ? { sandbox: built.runner }
      : {}),
    ...(baseRender.shellTimeoutMs === undefined
      ? { shellTimeoutMs: sandboxConfig.shell_timeout_ms }
      : {}),
  };

  // A LIVE custom-provider render needs its key NOW (the compile-if-stale step
  // checked it on a miss; a warm cache jumps straight to the render). Fail clean +
  // NON-ZERO. Skipped for the offline gate (test render) and the OpenRouter default.
  const liveCustomRender =
    input.providerPlan?.custom === true &&
    input.testRender === undefined &&
    input.offline !== true;
  if (
    liveCustomRender &&
    input.apiKey === undefined &&
    !hasModelKey(input.providerPlan!.apiKeyEnv, input.contractsDir)
  ) {
    throw new Error(missingProviderKeyHint(input.providerPlan!));
  }

  // 4. CONFIGURE + boot runProject (the SDK self-mounts + runs the boot sweep).
  const { reactor } = await callRunProject({
    compiled: compiledForRun,
    adapters,
    render,
    ...(input.renderModel !== undefined ? { renderModel: input.renderModel } : {}),
    ...(liveCustomRender && input.providerPlan !== undefined && input.apiKey !== undefined
      ? {
          providerPlan: input.providerPlan,
          apiKey: input.apiKey,
          providerLabel: input.providerPlan.provider,
        }
      : {}),
  });

  // 5. The PER-REACTOR serialization queue + the continuity scheduler.
  const queue = createSerialQueue();

  // readFreshness is OPT-IN: without a reader, the scheduler arms nothing (a
  // timeless project never self-rechecks). The offline gate injects a fake.
  const readFreshness =
    (input.testReadFreshness as (node: string) => never | null | undefined) ??
    (() => null);

  // The typed handle wires the continuity scheduler off itself — it already holds
  // the dag + topology the scheduler needs, so the `(reactor as { dag }).dag` +
  // `as never` casts are gone. `readFreshness` (the SDK `NodeFreshnessReader`) is
  // OPT-IN; the offline gate injects a fake.
  const scheduler = reactor.scheduler(
    readFreshness as NodeFreshnessReader,
    loaded.selfDrivenNodes,
  );
  // Arm once at boot (idempotent; re-derivable from the ledger + world-model).
  scheduler.arm();

  const pollOnce = (now: string): Promise<void> =>
    queue.enqueue(async () => {
      await scheduler.poll(now);
    });

  // Resolve a gateway poller per configured gateway (connector = fetch + extract +
  // stage + durable cursor). The plugin file is loaded once (the common case has
  // none). Each gateway's cursor round-trips the SAME storage registry the reactor
  // already persists to (no second state store). The offline gate's fake fetch
  // (keyed by source id) replaces the I/O.
  const plugins =
    input.testGatewayFetch === undefined ? loadConnectorPlugin(contractsDir) : {};
  // The gateway poller drives the reactor's async ingress. The typed handle's
  // `ingest(node, { wake })` IS the former `dag.ingestAsync(node, wake)` — adapt
  // it to the narrow `AsyncIngest` the poller expects (no `.dag` cast; store +
  // ledger are first-class on the handle).
  const gatewayRuntime: GatewayRuntime = {
    // The handle's `store`/`ledger` are first-class — narrow them to the gateway's
    // structural views (no `as unknown as { store }` reach into an un-surfaced field).
    store: reactor.store as StageStore,
    ledger: reactor.ledger as StageLedger,
    dag: {
      ingestAsync: (node: string, wake?: Wake) =>
        reactor.ingest(node, wake !== undefined ? { wake } : undefined),
    },
    // `adapters.storage` (the SDK StorageAdapter) satisfies RegistryStorage's
    // `readRegistry`/`writeRegistry` shape directly — no cast.
    storage: adapters.storage,
  };
  const gatewayPollers: ResolvedGatewayPoller[] = gateways.map((gw) =>
    resolveGatewayPoller(gw, gatewayRuntime, {
      plugins,
      ...(input.testGatewayFetch !== undefined
        ? { fetchOverride: input.testGatewayFetch(gw.source_id ?? gw.node) }
        : {}),
    }),
  );
  const gatewayNodes = gatewayPollers.map((p) => p.node);

  const pollGatewaysOnce = (now: string): Promise<readonly GatewayPollOutcome[]> =>
    // ONE serialized task drains EVERY gateway in order behind the per-reactor
    // queue — at most one drainAsync in flight per reactor. A gateway poll's stage
    // + wake never overlaps a continuity poll or trigger.
    queue.enqueue(async () => {
      const outcomes: GatewayPollOutcome[] = [];
      for (const poller of gatewayPollers) {
        outcomes.push(await poller.poll(now));
      }
      return outcomes;
    });

  const gatewayNodeSet = new Set(gatewayNodes);
  const trigger = (node: string, opts?: { wake?: Wake; data?: unknown }): Promise<TriggerOutcome> =>
    queue.enqueue(async () => {
      // The running-daemon trigger path: an external wake through the reactor's
      // async ingest (serialized — at most one drain in flight). The typed handle's
      // `ingest` IS the former `dag.ingestAsync` — no `.dag` cast.
      //
      // Deliver a trigger BODY by STAGING it into the node's ingress inbox (so the
      // upcoming ingest is a memo-miss that re-renders the node reading the
      // payload). Staging needs the node to carry an ingress edge — true for a
      // configured GATEWAY (its edge was augmented at boot). For a non-gateway node
      // there is no ingress input to move, so the body cannot be delivered through a
      // bare wake; report that honestly rather than silently dropping it.
      let dataDelivered = false;
      if (opts?.data !== undefined) {
        if (gatewayNodeSet.has(node)) {
          const stage = buildStageArrival(
            node,
            reactor.store as StageStore,
            reactor.ledger as StageLedger,
          );
          stage({ id: triggerArrivalId(opts.data), item: opts.data });
          dataDelivered = true;
        }
      }
      await reactor.ingest(node, { wake: opts?.wake ?? EXTERNAL_WAKE });
      return { dataDelivered };
    });

  const cost = (): CostRollup => rollupCost(reactor.ledger.all());

  const shutdown = async (): Promise<void> => {
    await queue.onIdle();
  };

  const nodes = loaded.ir.topology.topology.nodes.map((n) => n.node);

  return {
    name: input.name,
    reactor,
    queue,
    nodes,
    pollOnce,
    pollGatewaysOnce,
    gatewayNodes,
    trigger,
    cost,
    shutdown,
  };
}

/**
 * Boot a single-reactor daemon. Resolves the config for the project + state-dir,
 * then delegates to {@link bootReactorHandle}. A multi-reactor host uses
 * {@link bootHost} instead.
 */
export async function bootServe(
  options: ServeCommandOptions = {},
): Promise<ServeHandle> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const config = loadConfig({
    stateDir: options.stateDir,
    projectDir: options.projectDir,
    model: options.model,
  });

  const projectDir = path.resolve(options.projectDir ?? '.');
  const providerPlan = resolveProviderPlan(config.model);
  const apiKey =
    providerPlan.custom && options.offline !== true
      ? readModelKey(providerPlan.apiKeyEnv, projectDir)
      : undefined;

  return bootReactorHandle({
    name: 'default',
    contractsDir: projectDir,
    stateDir: config.state.dir,
    model: config.model.compile_model,
    renderModel: config.model.render_model,
    sandbox: config.sandbox,
    gateways: config.gateways,
    ...(providerPlan.custom ? { providerPlan } : {}),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(options.offline !== undefined ? { offline: options.offline } : {}),
    ...(options.model !== undefined ? { modelOverride: options.model } : {}),
    ...(options.testGatewayFetch !== undefined
      ? { testGatewayFetch: options.testGatewayFetch }
      : {}),
    ...(options.testAdapters !== undefined ? { testAdapters: options.testAdapters } : {}),
    ...(options.testRender !== undefined ? { testRender: options.testRender } : {}),
    ...(options.testReadFreshness !== undefined
      ? { testReadFreshness: options.testReadFreshness }
      : {}),
    ...(options.testCompileOptions !== undefined
      ? { testCompileOptions: options.testCompileOptions }
      : {}),
  });
}

/**
 * Run `reactor serve` as a blocking daemon (the production path). Boots the HOST
 * (one or many reactors per `reactor.yml`'s `reactors:` list), optionally binds
 * the HTTP server (`--http`), then loops: poll continuity across all reactors at
 * `now` (bounded by the `--concurrency` across-reactor worker pool), surface a
 * live cost line, sleep to the cadence ceiling (`--poll-interval`), repeat —
 * until SIGTERM/SIGINT, which drains every reactor's in-flight queue, closes the
 * HTTP server, and exits 0.
 *
 * The single-reactor case is just N=1: the host synthesizes one `"default"`
 * reactor and the HTTP surface omits the `/<name>` prefix. `--concurrency` is
 * across-reactor ONLY.
 */
export async function runServeCommand(
  options: ServeCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
  telemetry: Telemetry = NOOP_TELEMETRY,
): Promise<number> {
  const startedAt = Date.now();
  const intervalMs = options.pollIntervalMs ?? 60_000;
  const concurrency = options.concurrency ?? 1;
  /**
   * Build the `reactor.serve` extras (`ServeProperties`): the poll cadence +
   * concurrency, both bucketed. Carried on the boot event and the sampled
   * poll-cycle event.
   */
  const serveExtras = {
    pollIntervalBucket: bucketMs(intervalMs),
    concurrencyBucket: bucketCount(concurrency),
  };

  let host: Awaited<ReturnType<typeof bootHost>>;
  try {
    host = await bootHost({
      ...(options.stateDir !== undefined ? { stateDir: options.stateDir } : {}),
      ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
      ...(options.model !== undefined ? { model: options.model } : {}),
      ...(options.offline !== undefined ? { offline: options.offline } : {}),
      ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
      ...(options.testSeams !== undefined ? { testSeams: options.testSeams } : {}),
    });
  } catch (err) {
    // Boot failure (stale IR / compile failed / no contracts) gets a clean
    // one-liner + exit 1 — mirroring run/topology/compile — never a raw stack.
    const msg = err instanceof Error ? err.message : String(err);
    // A state-dir usage error is a usage fault (exit 2), not a boot failure.
    const usage = (err as { reactorCliUsageError?: boolean })?.reactorCliUsageError === true;
    const hint = /stale|compile/i.test(msg)
      ? ' — run `reactor compile` first (it needs a model key); the keyless surface works without one.'
      : '';
    if (options.json === true) {
      write(JSON.stringify({ status: 'error', message: msg }));
    } else {
      write(`${msg}${hint}`);
    }
    // A boot failure fires the coarse serve failure + a categorized error, then
    // returns — telemetry never alters the exit code.
    telemetry.event(
      TelemetryEvent.SERVE,
      buildEventProperties(
        { command: 'serve', outcome: 'failure', durationMs: Date.now() - startedAt },
        serveExtras,
      ),
    );
    telemetry.event(
      TelemetryEvent.ERROR,
      buildEventProperties(
        { command: 'serve', outcome: 'failure', durationMs: Date.now() - startedAt },
        { errorCategory: errorCategory(err) },
      ),
    );
    return usage ? 2 : 1;
  }

  // The host booted: fire ONE `reactor.serve` success at boot (the daemon may run
  // for hours, so the boot event is the reliable "a serve started" signal).
  telemetry.event(
    TelemetryEvent.SERVE,
    buildEventProperties(
      { command: 'serve', outcome: 'success', durationMs: Date.now() - startedAt },
      serveExtras,
    ),
  );

  let httpServer: HttpServerHandle | undefined;
  if (options.httpPort !== undefined) {
    const bindHost = options.httpHost ?? DEFAULT_HTTP_HOST;
    httpServer = await startHttpServer(host, options.httpPort, bindHost);
    if (options.json !== true) {
      write(`reactor serve — HTTP on ${bindHost}:${httpServer.port}`);
      // v1 has NO auth: an exposed POST /trigger/<node> can cause model spend.
      const loopback =
        bindHost === '127.0.0.1' || bindHost === '::1' || bindHost === 'localhost';
      if (!loopback) {
        write(
          `  WARNING: bound to ${bindHost} (not loopback) with NO auth in v1 — an ` +
            `unauthenticated POST /trigger/<node> can cause model spend. Put it ` +
            `behind a reverse proxy / network policy.`,
        );
      }
    }
  }

  if (options.returnHost === true) {
    // Tests drive the host (pollAll/byName/shutdown) + the HTTP handle directly.
    options.onHttpReady?.(httpServer);
    return 0;
  }

  if (options.json !== true) {
    write(
      `reactor serve — host booted (${host.reactors.length} reactor(s); ` +
        `concurrency ${host.pool.concurrency}). Ctrl-C to stop.`,
    );
  }

  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  // Poll-cycle telemetry is SAMPLED (first cycle only) so a long-running daemon
  // cannot flood the backend — the boot event already proved a serve started; the
  // first cycle proves the loop is live. A flag suffices for the first-only sample.
  let pollCycleSampled = false;

  // The driver loop: poll gateways (ingress) + continuity across all reactors,
  // surface live cost, sleep, until SIGTERM. Gateways poll BEFORE continuity each
  // tick so a freshly-staged arrival is visible to the same tick's continuity
  // sweep; both run behind each reactor's serialization queue.
  while (!stopped) {
    const now = host.reactors[0]?.reactor.clock.now() ?? new Date().toISOString();
    await host.pollGatewaysAll(now);
    await host.pollAll(now);
    if (!pollCycleSampled) {
      pollCycleSampled = true;
      telemetry.event(
        TelemetryEvent.SERVE,
        buildEventProperties(
          { command: 'serve', outcome: 'success', durationMs: Date.now() - startedAt },
          serveExtras,
        ),
      );
    }
    if (options.json !== true) {
      write(formatCostLine(host.cost().host));
    }
    await sleep(intervalMs, () => stopped);
  }

  // Graceful drain-then-exit (the SDK keeps no process alive; this is the CLI's).
  await host.shutdown();
  if (httpServer !== undefined) {
    await httpServer.close();
  }
  if (options.json !== true) {
    write('reactor serve — drained in-flight work; exiting.');
  }
  return 0;
}

/** Sleep `ms`, waking early when `cancelled()` flips true (responsive SIGTERM). */
function sleep(ms: number, cancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const step = Math.min(ms, 250);
    const start = Date.now();
    const tick = (): void => {
      if (cancelled() || Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, step);
    };
    setTimeout(tick, step);
  });
}
