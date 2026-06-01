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
import { createSerialQueue, type SerialQueue } from '../run/serial-queue';
import { isCacheFresh, contractSetFingerprint } from '../compile/ir-cache';
import { loadContractSet as keylessLoadContractSet } from '../compile/contract-images';
import type { ConfigOverrides } from '../config';
import { loadConfig } from '../config';
import { resolveSdk } from '../meta';
import { runCompileCommand, type CompileCommandOptions } from './compile';

import * as path from 'path';

/** A node freshness reader (SDK `NodeFreshnessReader`): (node) => schedule|null. */
export type FreshnessReader = (node: string) => unknown;

/** A running single-reactor daemon handle (for tests + the driver loop). */
export interface ServeHandle {
  /** The assembled, booted reactor. */
  readonly reactor: AssembledReactorLike;
  /** The per-reactor serialization queue every ingress + poll enqueues onto. */
  readonly queue: SerialQueue;
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
  /** Drain the queue to idle then resolve (graceful shutdown). */
  readonly shutdown: () => Promise<void>;
}

export interface ServeCommandOptions extends ConfigOverrides {
  readonly json?: boolean;
  readonly offline?: boolean;
  /** The continuity poll cadence ceiling (ms). Default 60_000. */
  readonly pollIntervalMs?: number;
  /** Test seam (OFFLINE gate): the durable/fake substrate + render wiring. */
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  /** Test seam: a fake `readFreshness` (opt-in; the gate injects one). */
  readonly testReadFreshness?: FreshnessReader;
  /** Test seam: compile-if-stale providers (offline). */
  readonly testCompileOptions?: CompileCommandOptions;
  /** Test seam: when true, return the handle instead of blocking on the loop. */
  readonly returnHandle?: boolean;
}

/** The SDK external wake (the barrel does not export the const; build it). */
const EXTERNAL_WAKE = Object.freeze({ source: 'external', refs: [] as string[] });

/**
 * Boot a single-reactor daemon: ensure IR fresh, configure + boot `runProject`,
 * wire the continuity scheduler behind the serialization queue, and return a
 * {@link ServeHandle}. The caller (the `serve` command, or a test) drives the
 * poll cadence; the handle's `shutdown` drains-then-exits.
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
  const stateDir = config.state.dir;
  const contractsDir = path.resolve(options.projectDir ?? '.');
  const model = config.model.compile_model;
  const sdkVersion = resolveSdk().version ?? 'unknown';

  // 1. Ensure the IR is fresh (compile if stale).
  const images = keylessLoadContractSet(contractsDir);
  if (images.length === 0) {
    throw new Error(
      `reactor serve: no .prose.md contracts found under ${contractsDir}`,
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
      throw new Error('reactor serve: compile failed (IR stale, refresh failed)');
    }
  }

  // 2. Load + re-lower (KEYLESS).
  const loaded = loadCompiledProject(stateDir);

  // 3. Build the DURABLE substrate (or the test substrate) + render wiring.
  const adapters: RunAdapters =
    options.testAdapters ?? buildDurableSubstrate(stateDir);
  const baseRender: RunRender = options.testRender ?? {};
  const render: RunRender = {
    ...baseRender,
    contractFor:
      baseRender.contractFor ?? ((node) => loaded.contractFor(node) as ContractView),
    projectTruthFor:
      baseRender.projectTruthFor ??
      ((node) => loaded.projectTruthFor(node) as ProjectTruthProjection),
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
    (options.testReadFreshness as (node: string) => never | null | undefined) ??
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

  const shutdown = async (): Promise<void> => {
    await queue.onIdle();
  };

  return { reactor, queue, pollOnce, trigger, shutdown };
}

/**
 * Run `reactor serve` as a blocking daemon (the production path). Boots the
 * single reactor, then loops: poll continuity at `now`, sleep to the soonest
 * armed recheck (bounded by `pollIntervalMs`), repeat — until SIGTERM/SIGINT,
 * which drains the in-flight queue and exits 0. In a test (`returnHandle`), this
 * returns 0 immediately after boot (the test drives the handle directly).
 */
export async function runServeCommand(
  options: ServeCommandOptions = {},
  write: (line: string) => void = (line) => process.stdout.write(line + '\n'),
): Promise<number> {
  const handle = await bootServe(options);

  if (options.returnHandle === true) {
    // Tests drive the handle (pollOnce/trigger/shutdown) directly.
    return 0;
  }

  if (options.json !== true) {
    write('reactor serve — single reactor booted; polling continuity. Ctrl-C to stop.');
  }

  const intervalMs = options.pollIntervalMs ?? 60_000;
  let stopped = false;
  const stop = (): void => {
    stopped = true;
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);

  // The driver loop: poll, then sleep to the cadence ceiling, until SIGTERM.
  while (!stopped) {
    await handle.pollOnce(handle.reactor.clock.now());
    await sleep(intervalMs, () => stopped);
  }

  // Graceful drain-then-exit (the SDK keeps no process alive; this is the CLI's).
  await handle.shutdown();
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
