/**
 * The multi-reactor `serve` HOST (CLI plan Phase 3 / `cli.md` §5.5).
 *
 * `serve` is a HOST, not a single reactor. One process boots N compiled reactors
 * — each declared in the `reactors:` list in `reactor.yml` (a single project is
 * the default, synthesized as ONE entry named `"default"`). Each hosted reactor
 * is fully ISOLATED: its own state-dir / substrate (ledger + world-model store +
 * registry), its own continuity schedule, its own gateway cursors, and its own
 * per-reactor serialization queue. One reactor stalling/crashing never corrupts
 * another (`cli.md` §5.5 isolation).
 *
 * `--concurrency N` is an ACROSS-reactor worker-pool bound: up to N reactors do
 * work (a continuity poll) in parallel across the host. WITHIN each reactor,
 * drains stay strictly SERIAL (the per-reactor serialization queue, correction
 * #4). Change B (within-reactor render parallelism) is DEFERRED — the SDK has no
 * `maxConcurrency` option, so the host NEVER parallelizes nodes inside a reactor;
 * the pool only overlaps DISTINCT reactors. Because reactors are isolated and
 * each is internally serial, running two concurrently can never interleave one's
 * reads/writes with another's — committed fingerprints/receipts are identical to
 * a serial host (determinism under across-reactor concurrency).
 *
 * KEYLESS at load: this module imports only the offline run-core + the serve
 * command's boot core (whose model surface is reached ONLY via the dynamic
 * import inside `callRunProject`). It pulls no `@openai/agents`/`zod` at scope.
 */

import {
  bootReactorHandle,
  type BootReactorInput,
  type FreshnessReader,
  type ServeHandle,
} from '../commands/serve';
import {
  renderDecodingInputs,
  type RunAdapters,
  type RunRender,
} from './load-run-project';
import type { ConnectorFetch } from './connectors';
import type { CompileCommandOptions } from '../commands/compile';
import { createWorkerPool, type WorkerPool } from './worker-pool';
import { rollupCost, type CostRollup } from './cost';
import {
  loadConfig,
  resolveReactors,
  type ConfigOverrides,
  type ResolvedReactor,
} from '../config';
import { readModelKey } from '../env';
import { resolveProviderPlan } from '../model/provider-plan';
import * as path from 'path';

/** Per-reactor test seams, keyed by reactor name (the offline gate injects these). */
export interface PerReactorTestSeam {
  readonly testAdapters?: RunAdapters;
  readonly testRender?: RunRender;
  readonly testReadFreshness?: FreshnessReader;
  readonly testCompileOptions?: CompileCommandOptions;
  /** Phase 4: a FAKE connector fetch (keyed by source id) for this reactor's gateways. */
  readonly testGatewayFetch?: (sourceId: string) => ConnectorFetch;
}

export interface BootHostOptions extends ConfigOverrides {
  readonly offline?: boolean;
  /** Across-reactor worker-pool bound (`--concurrency N`). Default 1. */
  readonly concurrency?: number;
  /**
   * Test seam (OFFLINE gate): per-reactor wiring keyed by the reactor's name.
   * A single-reactor host uses the name `"default"`.
   */
  readonly testSeams?: Readonly<Record<string, PerReactorTestSeam>>;
}

/** A running multi-reactor host: the isolated handles + the across-reactor pool. */
export interface HostHandle {
  /** The hosted reactors (>= 1), each isolated + internally serial. */
  readonly reactors: readonly ServeHandle[];
  /** True when the host serves exactly ONE reactor (HTTP omits the `/<name>` prefix). */
  readonly singleReactor: boolean;
  /** The across-reactor worker pool (concurrency bound). */
  readonly pool: WorkerPool;
  /** Look a hosted reactor up by name (the HTTP namespace). */
  readonly byName: (name: string) => ServeHandle | undefined;
  /**
   * Poll continuity across ALL reactors at `now`, bounded by the worker pool:
   * up to `concurrency` reactors poll in parallel; each reactor's poll is itself
   * serialized behind its own queue. Resolves once every reactor's poll settled.
   */
  readonly pollAll: (now: string) => Promise<void>;
  /**
   * Phase 4 — poll EVERY reactor's gateways at `now`, bounded by the same
   * across-reactor worker pool; each reactor's gateway poll is itself serialized
   * behind its own queue (correction #4). Resolves once every reactor settled.
   */
  readonly pollGatewaysAll: (now: string) => Promise<void>;
  /** The host-wide cost rollup (every reactor's ledger summed) + per-reactor. */
  readonly cost: () => HostCost;
  /** Drain every reactor's queue to idle then resolve (graceful shutdown). */
  readonly shutdown: () => Promise<void>;
}

/** The host-wide + per-reactor cost view (`cli.md` §5.4 / §5.5 roll-up). */
export interface HostCost {
  /** Summed across every hosted reactor's ledger. */
  readonly host: CostRollup;
  /** Per-reactor, keyed by reactor name. */
  readonly byReactor: Readonly<Record<string, CostRollup>>;
}

/**
 * Boot the multi-reactor host from a project's `reactor.yml`. Resolves the
 * `reactors:` list (or the synthesized single-reactor default), boots each
 * reactor's isolated handle (via {@link bootReactorHandle}), and wires the
 * across-reactor worker pool. The returned {@link HostHandle} is what the
 * `serve` driver loop + the HTTP server drive.
 */
export async function bootHost(options: BootHostOptions = {}): Promise<HostHandle> {
  if (options.offline === true) {
    process.env['REACTOR_OFFLINE'] = '1';
  }

  const config = loadConfig({
    ...(options.stateDir !== undefined ? { stateDir: options.stateDir } : {}),
    ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
    ...(options.model !== undefined ? { model: options.model } : {}),
  });
  const { reactors: resolved, singleReactor } = resolveReactors(config, {
    ...(options.projectDir !== undefined ? { projectDir: options.projectDir } : {}),
  });

  const model = config.model.compile_model;
  const seams = options.testSeams ?? {};

  // The provider config is TOP-LEVEL (shared by every hosted reactor). Resolve the
  // plan + read its key ONCE; each reactor's live render gets the same scoped
  // provider. The default OpenRouter path leaves the plan non-custom (the SDK
  // builds its provider lazily, unchanged).
  const providerPlan = resolveProviderPlan(config.model);
  const hostProjectDir = path.resolve(options.projectDir ?? '.');
  const apiKey =
    providerPlan.custom && options.offline !== true
      ? readModelKey(providerPlan.apiKeyEnv, hostProjectDir)
      : undefined;

  // Boot each reactor's isolated handle. Booting is sequential (each reactor's
  // boot is its own serial cold-miss sweep) — the pool parallelizes the steady
  // state (polls/ingress), not the one-time boot.
  const handles: ServeHandle[] = [];
  for (const entry of resolved) {
    const seam = seams[entry.name] ?? {};
    const input: BootReactorInput = {
      name: entry.name,
      contractsDir: entry.projectDir,
      stateDir: entry.stateDir,
      model,
      renderModel: config.model.render_model,
      ...renderDecodingInputs(config.model),
      sandbox: config.sandbox,
      gateways: entry.gateways,
      ...(providerPlan.custom ? { providerPlan } : {}),
      ...(apiKey !== undefined ? { apiKey } : {}),
      ...(options.offline !== undefined ? { offline: options.offline } : {}),
      ...(options.model !== undefined ? { modelOverride: options.model } : {}),
      ...(seam.testGatewayFetch !== undefined
        ? { testGatewayFetch: seam.testGatewayFetch }
        : {}),
      ...(seam.testAdapters !== undefined ? { testAdapters: seam.testAdapters } : {}),
      ...(seam.testRender !== undefined ? { testRender: seam.testRender } : {}),
      ...(seam.testReadFreshness !== undefined
        ? { testReadFreshness: seam.testReadFreshness }
        : {}),
      ...(seam.testCompileOptions !== undefined
        ? { testCompileOptions: seam.testCompileOptions }
        : {}),
    };
    handles.push(await bootReactorHandle(input));
  }

  const pool = createWorkerPool(options.concurrency ?? 1);
  const byNameMap = new Map(handles.map((h) => [h.name, h] as const));

  const pollAll = async (now: string): Promise<void> => {
    // Submit each reactor's poll to the across-reactor pool (bounded parallel);
    // each poll is itself serialized behind that reactor's own queue.
    await Promise.all(
      handles.map((h) => pool.submit(() => h.pollOnce(now))),
    );
  };

  const pollGatewaysAll = async (now: string): Promise<void> => {
    // Each reactor's gateway poll is submitted to the across-reactor pool; the
    // poll itself enqueues onto that reactor's serialization queue (correction #4),
    // so within a reactor a gateway poll never overlaps a continuity poll/trigger.
    await Promise.all(
      handles.map((h) => pool.submit(() => h.pollGatewaysOnce(now))),
    );
  };

  const cost = (): HostCost => {
    const byReactor: Record<string, CostRollup> = {};
    const allReceipts = handles.flatMap((h) => [...h.reactor.ledger.all()]);
    for (const h of handles) {
      byReactor[h.name] = h.cost();
    }
    return { host: rollupCost(allReceipts), byReactor };
  };

  const shutdown = async (): Promise<void> => {
    await Promise.all(handles.map((h) => h.shutdown()));
    await pool.onIdle();
  };

  return {
    reactors: handles,
    singleReactor,
    pool,
    byName: (name) => byNameMap.get(name),
    pollAll,
    pollGatewaysAll,
    cost,
    shutdown,
  };
}

/** Re-export the resolved-reactor shape for the host's consumers. */
export type { ResolvedReactor };
