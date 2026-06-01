/**
 * `reactor serve` (single reactor) — the durable daemon (CLI plan Phase 2).
 *
 * Builds the DURABLE substrate (system clock + filesystem storage under
 * `<state-dir>/receipts` + filesystem world-model under `<state-dir>/world-models`),
 * CONFIGURES `runProject` (which self-mounts + runs the boot cold-miss sweep),
 * then runs the driver loop behind a PER-REACTOR serialization queue (correction
 * #4): the continuity poll + every ingress (`trigger`/HTTP, Phase 3) enqueue onto
 * ONE async-serial executor, so at most one `drainAsync` is in flight per reactor.
 *
 * Continuity: a single `createAsyncContinuityScheduler` armed once, then polled
 * on a cadence; the loop sleeps to the soonest armed `next_self_recheck`.
 * `readFreshness` is OPT-IN per project (nothing writes `valid_until` by default;
 * the offline gate injects a fake reader, as the SDK scheduler test does).
 *
 * Graceful shutdown: SIGTERM/SIGINT → stop arming new work, drain the in-flight
 * queue, then resolve (the SDK keeps no process alive; this is the CLI's).
 *
 * OFFLINE-SAFE (N2): keyless at load (run-core + continuity scheduler are on the
 * root barrel); the model surface is reached ONLY via `callRunProject`'s dynamic
 * import. The offline gate drives `serveOnce`/the handle directly with a fake
 * render; a live `serve` builds the substrate and blocks on the loop.
 */

import { createAsyncContinuityScheduler } from '@openprose/reactor';

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
import {
  rollupCost,
  formatCostLine,
  type CostReceipt,
  type CostRollup,
} from '../run/cost';
import { bootHost, type PerReactorTestSeam } from '../run/host';
import { startHttpServer, type HttpServerHandle } from '../run/http-server';
import { isCacheFresh, contractSetFingerprint } from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import type { ConfigOverrides, SandboxConfig } from '../config';
import { loadConfig } from '../config';
import { resolveSdk } from '../meta';
import { runCompileCommand, type CompileCommandOptions } from './compile';

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
   * Enqueue an external trigger of `node` (the running-daemon path). Serialized.
   * Passes the SDK external wake `{ source: "external", refs: [] }`.
   */
  readonly trigger: (node: string, wake?: unknown) => Promise<void>;
  /** This reactor's current cost rollup, read off its ledger (§5.4). */
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
   * Phase 5 — the reactor's `[sandbox]` config. Drives the workspace-scoped render
   * sandbox runner + the per-command shell timeout. Omitted (single test seam) →
   * the locked `mode: none` default (no runner; bounded LocalShell).
   */
  readonly sandbox?: SandboxConfig;
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
  /** Test seam (OFFLINE gate): the durable/fake substrate + render wiring. */
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  /** Test seam: a fake `readFreshness` (opt-in; the gate injects one). */
  readonly testReadFreshness?: FreshnessReader;
  /** Test seam: compile-if-stale providers (offline). */
  readonly testCompileOptions?: CompileCommandOptions;
  /** Test seam: when true, return the handle instead of blocking on the loop. */
  readonly returnHandle?: boolean;
  /** Test seam (Phase 3): per-reactor wiring keyed by name (multi-reactor host). */
  readonly testSeams?: Readonly<Record<string, PerReactorTestSeam>>;
  /** Test seam: when true, boot the host + HTTP then return (drive them directly). */
  readonly returnHost?: boolean;
  /** Test seam: receives the HTTP handle once bound (with `returnHost`). */
  readonly onHttpReady?: (http: HttpServerHandle | undefined) => void;
}

/** The SDK external wake (the barrel does not export the const; build it). */
const EXTERNAL_WAKE = Object.freeze({ source: 'external', refs: [] as string[] });

/**
 * Boot ONE reactor handle from already-RESOLVED inputs (the shared core of both
 * the single-reactor `bootServe` and the multi-reactor host). Ensure IR fresh,
 * configure + boot `runProject`, wire the continuity scheduler behind a
 * PER-REACTOR serialization queue, and return a {@link ServeHandle}. The handle
 * is ISOLATED: its own state-dir, substrate, schedule, and serialization queue
 * (correction #4 / `cli.md` §5.5 isolation).
 */
export async function bootReactorHandle(
  input: BootReactorInput,
): Promise<ServeHandle> {
  if (input.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const { contractsDir, stateDir, model } = input;
  const sdkVersion = resolveSdk().version ?? 'unknown';

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

  // 3. Build the DURABLE substrate (or the test substrate) + render wiring.
  const adapters: RunAdapters =
    input.testAdapters ?? buildDurableSubstrate(stateDir);
  const baseRender: RunRender = input.testRender ?? {};
  // Phase 5: construct the render sandbox runner from `[sandbox]` (mode none →
  // none; docker present → workspace-scoped network-off container; docker absent →
  // none + a note). The workspace root is the reactor's isolated state dir (the
  // harness harvests host-side). Thread `shell_timeout_ms` onto the render bound.
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

  // 4. CONFIGURE + boot runProject (the SDK self-mounts + runs the boot sweep).
  const { reactor } = await callRunProject({
    compiled: loaded.compiled,
    adapters,
    render,
  });

  // 5. The PER-REACTOR serialization queue + the continuity scheduler.
  const queue = createSerialQueue();

  // readFreshness is OPT-IN: without a reader, the scheduler arms nothing (a
  // timeless project never self-rechecks). The offline gate injects a fake.
  const readFreshness =
    (input.testReadFreshness as (node: string) => never | null | undefined) ??
    (() => null);

  const scheduler = createAsyncContinuityScheduler({
    dag: (reactor as { dag: unknown }).dag,
    topology: (loaded.compiled as { reconcilerTopology: unknown }).reconcilerTopology,
    nodes: loaded.selfDrivenNodes,
    readFreshness: readFreshness as never,
  } as never);
  // Arm once at boot (idempotent; re-derivable from the ledger + world-model).
  scheduler.arm();

  const pollOnce = (now: string): Promise<void> =>
    queue.enqueue(async () => {
      await scheduler.poll(now);
    });

  const trigger = (node: string, wake?: unknown): Promise<void> =>
    queue.enqueue(async () => {
      // The running-daemon trigger path: an external wake through the reactor's
      // async ingest (serialized — at most one drain in flight, correction #4).
      const dag = (reactor as { dag: { ingestAsync: (n: string, w: unknown) => Promise<unknown> } }).dag;
      await dag.ingestAsync(node, wake ?? EXTERNAL_WAKE);
    });

  const cost = (): CostRollup =>
    rollupCost(
      reactor.ledger.all().map((r): CostReceipt => ({
        node: r.node,
        status: r.status,
        cost: r.cost as CostReceipt['cost'],
      })),
    );

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
    trigger,
    cost,
    shutdown,
  };
}

/**
 * Boot a single-reactor daemon (the Phase-2 public API, kept for the run/serve
 * gate). Resolves the config for the project + state-dir, then delegates to
 * {@link bootReactorHandle}. A multi-reactor host uses {@link bootHost} instead.
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

  return bootReactorHandle({
    name: 'default',
    contractsDir: path.resolve(options.projectDir ?? '.'),
    stateDir: config.state.dir,
    model: config.model.compile_model,
    sandbox: config.sandbox,
    ...(options.offline !== undefined ? { offline: options.offline } : {}),
    ...(options.model !== undefined ? { modelOverride: options.model } : {}),
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
 * reactor and the HTTP surface omits the `/<name>` prefix. Within-reactor
 * parallelism is DEFERRED (Change B) — `--concurrency` is across-reactor ONLY.
 */
export async function runServeCommand(
  options: ServeCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  const host = await bootHost({
    ...(options.stateDir !== undefined ? { stateDir: options.stateDir } : {}),
    ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
    ...(options.model !== undefined ? { model: options.model } : {}),
    ...(options.offline !== undefined ? { offline: options.offline } : {}),
    ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}),
    ...(options.testSeams !== undefined ? { testSeams: options.testSeams } : {}),
  });

  let httpServer: HttpServerHandle | undefined;
  if (options.httpPort !== undefined) {
    httpServer = await startHttpServer(host, options.httpPort);
    if (options.json !== true) {
      write(`reactor serve — HTTP on :${httpServer.port}`);
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

  const intervalMs = options.pollIntervalMs ?? 60_000;
  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  // The driver loop: poll all reactors, surface live cost, sleep, until SIGTERM.
  while (!stopped) {
    const now = host.reactors[0]?.reactor.clock.now() ?? new Date().toISOString();
    await host.pollAll(now);
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
