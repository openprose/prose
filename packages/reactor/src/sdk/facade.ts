// The `reactor()` facade — the one batteries-included top rung.
//
// `reactor(projectPath, options)` is the "trivial to start" front door: ONE call
// takes a directory of `.prose.md` contracts ALL THE WAY to a booted, reconciling
// reactor and hands back the typed {@link Reactor} handle (reactor-handle.ts).
// It is pure SUGAR — everything it does is reachable one rung down (`compileProject`
// + `createReactor` + the boot sweep on `/run`); its return value IS the rung-1
// handle, so there is never a second parallel API.
//
// OFFLINE BOUNDARY (load-bearing). `compileProject` / `runProject` deep-import the
// live agent adapters (`@openai/agents` + `zod`). This module therefore reaches
// them ONLY through a dynamic `import("../run")` inside the facade body — it is
// keyless at module-load scope, so importing `reactor` from the curated front
// door never pulls a provider. `{ mode: "inspect" }` is the keyless posture: it
// compiles + assembles but does not load a render provider (the offline fake /
// inspection path).
//
// Source of truth: the API ideal-surface plan §3.3 (the facade desugars onto
// createReactor + the /run compile path; its return IS the Reactor handle), §3.5
// (one typed handle), §3.4 (the substrate). The facade builds nothing the rungs
// below it cannot — every option is a documented desugaring.

import {
  fileSystemSubstrate,
  inMemorySubstrate,
  type Substrate,
} from "../adapters";
import type { ClockAdapter, StorageAdapter } from "../adapters/types";
import type { WorldModelStore } from "../world-model";
import type { RenderOptions } from "../adapters/agent-render/passthrough";
import type { MutableReceiptLedger } from "./mounted-dag";
import type { NodeFreshnessReader } from "./continuity-scheduler";
import type { Reactor } from "./reactor-handle";
import type { CompileProjectInput } from "./run-project";

// ---------------------------------------------------------------------------
// Facade configuration
// ---------------------------------------------------------------------------

/**
 * The backends the facade swaps in (a `Partial` substrate + the model/ingress
 * seams). Substrate fields are OPTIONAL — the facade defaults the rest
 * (filesystem when {@link ReactorOptions.directory} is set, in-memory otherwise).
 */
export interface ReactorAdapters {
  /** The clock (the only time source). Defaults to the system clock. */
  readonly clock?: ClockAdapter;
  /** The durable storage adapter (the ledger's append-only trail). */
  readonly storage?: StorageAdapter;
  /** The world-model store. Defaults to a fresh store over `directory`. */
  readonly worldModel?: WorldModelStore;
  /** The receipt ledger. Defaults to the storage-derived durable ledger. */
  readonly ledger?: MutableReceiptLedger;
  // NOTE [seam — later workstream]: `renderBackend` (the §5.4 model-injection
  // port) and `connectors` (the §5.6 ingress-arming path) land additively in the
  // Substrate + RenderBackend + ingress workstreams. They attach here without a
  // breaking change (this interface widens), so the facade shape is stable now.
}

/** The continuity-arming options the facade forwards to {@link Reactor.scheduler}. */
export interface ScheduleOptions {
  /** Project a node's freshness state into a continuity schedule (opt-in per project). */
  readonly readFreshness: NodeFreshnessReader;
  /** The self-driven node identities to arm (default: every topology node). */
  readonly nodes?: readonly string[];
}

/** The facade options — every field a documented desugaring of a rung below. */
export interface ReactorOptions {
  /** Durable truth + receipts. Omit → in-memory (ephemeral, tests/replay). */
  readonly directory?: string;
  /**
   * `"run"` (default) drives live renders; `"inspect"` is the keyless posture —
   * it compiles + assembles + boots WITHOUT loading a render provider (the
   * offline / inspection boundary). In `"inspect"` mode a {@link ReactorOptions.render}
   * `buildRender` fake is required to drive any node.
   */
  readonly mode?: "run" | "inspect";
  /** Run the boot cold-miss sweep after assembly (default true). */
  readonly boot?: boolean;
  /**
   * THE `@openai/agents` escape hatch (the NAMED PRIORITY), forwarded VERBATIM to
   * every render (§4). The reserved four (`instructions`/`tools`/`outputType`/
   * `name`) are `Omit`-ed (a compile error). Also carries the offline `buildRender`
   * fake seam.
   */
  readonly render?: RenderOptions & {
    /** The OFFLINE fake-render seam: `(store) => AsyncMountedRender`. */
    readonly buildRender?: (store: WorldModelStore) => unknown;
    /** Per-node compiled-contract view override (defaults from the loaded contract). */
    readonly contractFor?: (node: string) => unknown;
    /** Per-node truth projection (GOTCHA 1's other half). */
    readonly projectTruthFor?: (node: string) => unknown;
  };
  /** The backends to swap in (a Partial substrate). */
  readonly adapters?: ReactorAdapters;
  /** Arm the self-driven continuity cadence off the handle's topology. */
  readonly schedule?: ScheduleOptions;
  /**
   * The compile-phase knobs forwarded to `compileProject` — the per-call session
   * `options` (provider/model/skill/...), `perStep` per-node overrides (an offline
   * test hands a step-specific fake provider), and `skipPostconditions`. The
   * facade derives the contract source from `projectPath`, so `contractsDir` /
   * `contracts` are omitted here.
   */
  readonly compile?: Omit<CompileProjectInput, "contractsDir" | "contracts">;
}

/** The result of {@link reactor}: the booted handle + the boot sweep's results. */
export interface ReactorFacadeResult {
  /** The typed reactor handle (drive / observe / schedule). */
  readonly reactor: Reactor;
  /** The boot cold-miss sweep's per-node results (empty when `boot: false`). */
  readonly bootResults: readonly unknown[];
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Compile a `.prose` project, assemble a reactor over its substrate, optionally
 * boot it to a fixpoint, and hand back the typed {@link Reactor} handle.
 *
 * ```ts
 * import { reactor } from "@openprose/reactor";
 *
 * const { reactor: r } = await reactor("./my-project", { directory: "./state" });
 * await r.ingest("source", { wake: { source: "external", refs: [] } });
 * console.log(r.ledger.all().length);
 * ```
 *
 * The facade dynamic-imports the model-bearing `/run` barrel inside its body, so
 * the curated front door that re-exports `reactor` stays keyless at load. Returns
 * the rung-1 handle directly — it is sugar over `compileProject` + `createReactor`
 * + `boot()`, never a parallel API.
 */
export async function reactor(
  projectPath: string,
  options: ReactorOptions = {},
): Promise<ReactorFacadeResult> {
  if (typeof projectPath !== "string" || projectPath.length === 0) {
    throw new TypeError("reactor(projectPath): a contracts directory is required");
  }

  // OFFLINE BOUNDARY: reach the model-bearing run phase ONLY here, via a dynamic
  // import, so the curated front door is keyless at load scope.
  const run = await import("../run");

  const compiled = await run.compileProject({
    contractsDir: projectPath,
    ...(options.compile ?? {}),
  });

  const substrate = resolveSubstrate(options);
  const render = resolveRender(options);

  // `runProject` mounts + runs the boot cold-miss sweep, returning the typed
  // handle. The handle's drive verbs (incl. `boot()`) remain callable for a
  // later explicit sweep.
  const { reactor: handle, bootResults } = await run.runProject({
    compiled,
    substrate,
    ...(options.directory !== undefined ? { directory: options.directory } : {}),
    render,
  } as never);

  // Arm the self-driven cadence off the handle when requested (the handle holds
  // the topology + dag the scheduler needs — no casting).
  if (options.schedule !== undefined) {
    const { readFreshness } = options.schedule;
    const nodes =
      options.schedule.nodes ??
      handle.topology.topology.nodes.map((n) => n.node);
    const scheduler = handle.scheduler(readFreshness, nodes);
    scheduler.arm();
  }

  return {
    reactor: handle,
    bootResults: options.boot === false ? [] : bootResults,
  };
}

// ---------------------------------------------------------------------------
// internals — the desugaring helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the run {@link Substrate} from the facade options. The default base is
 * the blessed factory — `fileSystemSubstrate({ directory })` (durable) when a
 * `directory` is set, else `inMemorySubstrate()` (ephemeral, tests/replay) — so
 * the storage→ledger restart-survival derivation is baked in (REHOME-MAP
 * invariant #1). The caller's explicit `adapters` fields then override piecewise
 * (the blessed spread idiom: `{ ...fileSystemSubstrate({ directory }), storage }`).
 */
function resolveSubstrate(options: ReactorOptions): Substrate {
  const a = options.adapters ?? {};
  const base =
    options.directory !== undefined
      ? fileSystemSubstrate({ directory: options.directory })
      : inMemorySubstrate();
  return {
    clock: a.clock ?? base.clock,
    storage: a.storage ?? base.storage,
    worldModel: a.worldModel ?? base.worldModel,
    ledger: a.ledger ?? base.ledger,
  };
}

/** Resolve the render wiring (the escape hatch + the offline fake + projections). */
function resolveRender(options: ReactorOptions): unknown {
  const r = options.render ?? {};
  return { ...r };
}
