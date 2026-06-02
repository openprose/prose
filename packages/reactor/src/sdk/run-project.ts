/**
 * The in-package end-to-end RUNNER (PHASE5 §4; intelligent-react #13). The thin
 * deterministic seam that takes a directory of `.prose.md` contracts ALL THE WAY
 * to a booted, reconciling reactor — WITHOUT any hand-authored topology and
 * WITHOUT any new `.prose` parser. Two phases, mirroring the architecture's
 * determinism boundary:
 *
 *   1. {@link compileProject} — the COMPILE phase as SESSIONS. `loadContractSet`
 *      (trivial file-loading) → `compileForme` (the topology session) → per node
 *      `compileCanonicalizer` + `compilePostcondition` (the materiality + commit-
 *      gate sessions). Returns the mountable `ReconcilerTopology` + the per-node
 *      compiled canonicalizers/validators. Every model call is a session; pass a
 *      FAKE provider via `options` for an offline (keyless) compile.
 *
 *   2. {@link runProject} — the RUN phase, dumb. Builds the live agent-render over
 *      the SAME world-model store `createReactor` commits to, mounts each node's
 *      render with the canonicalizer its canonicalizer-SESSION emitted
 *      (`compiledStoreCanonicalizer` — GOTCHA 1: NOT `atomicCanonicalizer`, or a
 *      producer's moved facet never propagates), assembles the reactor, and runs
 *      the BOOT cold-miss sweep (`reactor.bootAsync()` — GOTCHA 2: boot is the
 *      honest first render of a pure source; only sources are seeded, input-driven
 *      nodes wake via propagation).
 *
 * Determinism boundary (THREE PRINCIPLES): the SESSIONS produce artifacts
 * (topology + canonicalizers); the dumb run phase EXECUTES them. The canonicalizer
 * is a deterministic run-time reduction, never a model call. The render WRITES
 * files to its workspace; the harness promotes-and-fingerprints — file contents
 * never ride `finalOutput`.
 *
 * Offline-build guard: this module DEEP-IMPORTS the live adapters (agent-render /
 * agent-compile) — both `@openai/agents`+`zod` (dev/optional) consumers. It is
 * therefore intentionally NOT re-exported from the offline barrels
 * (`src/sdk/index.ts`, `src/adapters/index.ts`); a consumer of the offline core
 * never reaches it, and a keyless build never constructs a provider (the
 * agent-render factory builds its provider lazily on first render).
 */

import {
  compileForme,
  compileCanonicalizer,
  compilePostcondition,
  loadContractSet,
  type ContractSet,
  type CompileStepOptions,
  type CompiledNode,
  type CompilePostconditionsResult,
} from "../adapters/agent-compile";
import { compilePostconditions } from "../postcondition";
import {
  createAgentRender,
  type CompiledContractView,
  type RenderOptions,
  type RenderSandboxRunner,
} from "../adapters/agent-render";
import { asFingerprint } from "../shapes";
import type { Cost, Fingerprint } from "../shapes";
import type { ReconcilerTopology } from "../reactor";
import { contentAddressOf } from "../world-model/canonical";
import type {
  WorldModelStore,
  WorldModelFiles,
} from "../world-model";
import { FileSystemWorldModelStore } from "../world-model/fs-store";
import type {
  ClockAdapter,
  StorageAdapter,
} from "../adapters/types";
import type { Substrate } from "../adapters/substrate";
import { createReactor } from "./create-reactor";
import type { MutableReceiptLedger } from "./mounted-dag";
import type { Reactor } from "./reactor-handle";
import {
  compiledStoreCanonicalizer,
  type TruthProjection,
} from "./render-atom";
import type { ReconcileResult } from "../reactor";
import type { AsyncNodeMount, AsyncMountedRender } from "./mounted-dag";

// ---------------------------------------------------------------------------
// 1. compileProject — the compile phase as SESSIONS → a mountable project
// ---------------------------------------------------------------------------

/** The per-node compile artifacts the run phase mounts. */
export interface CompiledProjectNode {
  /** The run-time canonicalizer (materiality frozen at compile, world-model.md §3). */
  readonly compiled: CompiledNode;
  /** The deterministic commit-gate validator set (architecture.md §3.3). */
  readonly postconditions: CompilePostconditionsResult;
}

/** The fully compiled project: the mountable topology + per-node artifacts. */
export interface CompiledProject {
  /** Forme's output — the mountable DAG (no hand-authoring). */
  readonly reconcilerTopology: ReconcilerTopology;
  /** The per-node compiled canonicalizers + postcondition validators. */
  readonly perNode: Readonly<Record<string, CompiledProjectNode>>;
  /** The loaded contract set (the source the sessions read). */
  readonly contracts: ContractSet;
  /** The per-node contract fingerprints (the memo key's first half). */
  readonly contractFingerprints: Readonly<Record<string, Fingerprint>>;
  /** The summed session cost across every compile step. */
  readonly cost: Cost;
}

/** Input to {@link compileProject}: a contracts directory OR a loaded set. */
export interface CompileProjectInput {
  /** Directory of `.prose.md` contracts (loaded deterministically). */
  readonly contractsDir?: string;
  /** An already-loaded contract set (skips `loadContractSet`). */
  readonly contracts?: ContractSet;
  /**
   * The per-call compile-session knobs (provider/model/skill/temperature/...).
   * Pass `{ provider: fakeStructuredProvider(...), skill: 'TEST SKILL' }` for an
   * offline compile. NOTE: each compile STEP emits a different `outputType`
   * (forme vs canonicalizer vs postcondition), so a single shared canned-JSON
   * fake provider cannot satisfy all three — use {@link perStepOptions} to hand a
   * distinct provider per step for offline tests.
   */
  readonly options?: CompileStepOptions;
  /**
   * Optional PER-STEP option overrides, merged over {@link options}. Lets an
   * offline test hand a step-specific fake provider (forme/canonicalizer/
   * postcondition emit distinct schemas). A live compile leaves this unset and
   * the real provider serves every step.
   */
  readonly perStep?: PerStepCompileOptions;
  /**
   * Skip the per-node postcondition SESSION and synthesize an EMPTY validator set
   * (the pure {@link compilePostconditions} lowering over `[]`, no model call).
   *
   * The run phase ({@link runProject}) does not consult `perNode[...].postconditions`
   * today — mounting + boot drive only the compiled canonicalizer — so this leaves
   * propagation/boot behavior unchanged. It exists so a LIVE end-to-end run can
   * exercise the real Forme + canonicalizer sessions and the real render WITHOUT
   * depending on the postcondition session's recursive-predicate output schema,
   * which the current structured-output model (Google AI Studio) rejects with
   * `reference to undefined schema at ...predicate` for the `and`/`or`/`not`
   * predicate DSL. The OFFLINE gate leaves this unset and still drives the full
   * three-step compile with fake providers, so the postcondition wiring stays
   * covered. Defaults to `false`.
   */
  readonly skipPostconditions?: boolean;
}

/**
 * Per-step option overrides. For the canonicalizer/postcondition steps the
 * override may be a per-NODE map (each node's session emits a node-specific
 * schema) or a single options object applied to every node.
 */
export interface PerStepCompileOptions {
  readonly forme?: CompileStepOptions;
  readonly canonicalizer?:
    | CompileStepOptions
    | Readonly<Record<string, CompileStepOptions>>;
  readonly postcondition?:
    | CompileStepOptions
    | Readonly<Record<string, CompileStepOptions>>;
}

/**
 * Compile a `.prose` project to a mountable shape (PHASE5 §4a). Loads the
 * contract set, derives each contract's fingerprint with the EXISTING content-
 * address helper (`contentAddressOf` over the contract's serialized source bytes
 * — NOT a new hash), runs the Forme session for the topology, then per node runs
 * the canonicalizer + postcondition sessions. Returns the topology + per-node
 * artifacts the run phase mounts.
 */
export async function compileProject(
  input: CompileProjectInput,
): Promise<CompiledProject> {
  const contracts = resolveContracts(input);
  const baseOptions = input.options ?? {};

  // Derive contract fingerprints from the LOADED contract source bytes via the
  // existing content-address helper (drift[0] resolution (a)): a thin
  // deterministic wrap over `contentAddressOf` — the runner does NOT invent a
  // hash, it reuses the same content-address primitive the world-model store
  // fingerprints artifacts with. Keyed by node id (= contract id).
  const contractFingerprints = deriveContractFingerprints(contracts);

  const formeOptions = mergeOptions(baseOptions, input.perStep?.forme);
  const forme = await compileForme(
    contracts,
    contractFingerprints,
    formeOptions,
  );

  let totalFresh = forme.cost.tokens.fresh;
  let totalReused = forme.cost.tokens.reused;
  let provider = forme.cost.provider;
  let model = forme.cost.model;

  const perNode: Record<string, CompiledProjectNode> = {};
  for (const node of forme.reconcilerTopology.topology.nodes) {
    const nodeId = node.node;

    const canonOptions = mergeOptions(
      baseOptions,
      resolveNodeStepOptions(input.perStep?.canonicalizer, nodeId),
    );
    const pcOptions = mergeOptions(
      baseOptions,
      resolveNodeStepOptions(input.perStep?.postcondition, nodeId),
    );

    const { compiled, cost: canonCost } = await compileCanonicalizer(
      nodeId,
      contracts,
      canonOptions,
    );

    let postconditions: CompilePostconditionsResult;
    if (input.skipPostconditions === true) {
      // Synthesize an EMPTY validator set via the pure lowering (no model call).
      // The run phase does not consult postconditions today, so this is a faithful
      // no-op for propagation/boot — see CompileProjectInput.skipPostconditions.
      postconditions = compilePostconditions(
        nodeId,
        [],
        contractFingerprints[nodeId] ?? nodeId,
      );
      totalFresh += canonCost.tokens.fresh;
      totalReused += canonCost.tokens.reused;
    } else {
      const { result, cost: pcCost } = await compilePostcondition(
        nodeId,
        contracts,
        pcOptions,
      );
      postconditions = result;
      totalFresh += canonCost.tokens.fresh + pcCost.tokens.fresh;
      totalReused += canonCost.tokens.reused + pcCost.tokens.reused;
    }

    perNode[nodeId] = { compiled, postconditions };
    provider = canonCost.provider;
    model = canonCost.model;
  }

  const cost: Cost = {
    provider,
    model,
    tokens: { fresh: totalFresh, reused: totalReused },
    // The compile run is a `self`-driven build (the compile sessions report
    // `self`, mirroring compile-session.test.ts).
    surprise_cause: "self",
  };

  return {
    reconcilerTopology: forme.reconcilerTopology,
    perNode,
    contracts,
    contractFingerprints,
    cost,
  };
}

// ---------------------------------------------------------------------------
// 2. runProject — the dumb run phase: mount + boot the compiled project
// ---------------------------------------------------------------------------

/**
 * The render-wiring knobs for {@link runProject}. The render factory needs a
 * per-node compiled-contract VIEW (the instruction layer) and a per-node
 * `projectTruth` (how that node lays its structured truth out on disk, so the
 * compiled canonicalizer can reduce it). Everything else (provider/model/skill/
 * seed/...) is the agent-render factory's own config, passed through.
 */
export interface RunProjectRender {
  /**
   * Per-node compiled-contract view (the instruction layer the render carries).
   * Omit to derive a minimal view from the loaded contract + Forme's topology.
   */
  readonly contractFor?: (node: string) => CompiledContractView;
  /**
   * Per-node truth projection (GOTCHA 1's other half): how a node's published
   * world-model FILES map into the structured `WorldModelValue` its compiled
   * canonicalizer reduces. A producer that maintains a named facet MUST supply
   * one so its facet fingerprint moves and propagation fires. A node with no
   * named-facet subscribers may omit it (defaults to the empty projection).
   */
  readonly projectTruthFor?: (node: string) => TruthProjection;
  /**
   * The render-body factory seam. Defaults to {@link createAgentRender} over the
   * SAME world-model store the reactor commits to (the live path). The OFFLINE
   * gate injects a fake `AsyncMountedRender` that writes the workspace directly
   * (the same harness seam a live render hits, minus the SDK tool loop) — exactly
   * as agent-render.test.ts proves the harness wiring with a fake render. The
   * factory is handed the shared store so a fake honors GOTCHA 1's other half:
   * write the producer's structured truth file that `projectTruthFor` reads.
   */
  readonly buildRender?: (store: WorldModelStore) => AsyncMountedRender;
  /** The render model provider — a fake for offline; the real one is lazy. */
  readonly provider?: import("@openai/agents").ModelProvider;
  /** The render model id (defaults to the agent-render default). */
  readonly model?: string;
  /** Pre-read SKILL system prompt (offline tests pass a stub). */
  readonly skill?: string;
  /** Path to the SKILL when `skill` is not supplied. */
  readonly skillPath?: string;
  /** Decoding temperature (defaults 0). */
  readonly temperature?: number;
  /** Reproducibility seed. */
  readonly seed?: number;
  /** Max agentic turns per render. */
  readonly maxTurns?: number;
  /**
   * Change C — the folded render sandbox (architecture.md §5.3), passed through to
   * {@link createAgentRender}'s `sandbox` so a caller-supplied
   * {@link RenderSandboxRunner} reaches the live render's `sandbox_exec` tool. The
   * SDK still ships NO concrete runner; CONSTRUCTING one stays a CLI concern (this
   * is a TYPE only). Unset → the live render has no sandbox (`sandbox_exec`
   * declines), exactly as today. Ignored when {@link buildRender} is supplied
   * (the offline fake owns its own body).
   */
  readonly sandbox?: RenderSandboxRunner;
  /**
   * Change C — the per-command `shell_exec` timeout (ms), passed through to
   * {@link createAgentRender}'s `shellTimeoutMs` so the cwd-rooted shell the render
   * runs commands in is bounded by the caller's value (the CLI's
   * `[sandbox].shell_timeout_ms`). Unset → the shell keeps its 300_000 ms default,
   * exactly as today. Ignored when {@link buildRender} is supplied.
   */
  readonly shellTimeoutMs?: number;
  /**
   * The full `@openai/agents` escape hatch (the NAMED PRIORITY): the layered
   * {@link RenderOptions} (Tier A sugar -> Tier B `agent`/`runConfig`/`runOptions`/
   * `extraTools`/`instructionsSuffix`/`tracing`/`signal` passthrough -> Tier C
   * `agentFactory`/`runnerFactory`). Spread VERBATIM onto the live
   * {@link createAgentRender} config so a `runProject` consumer reaches every SDK
   * knob the render does — the reserved four (`instructions`/`tools`/`outputType`/
   * `name`) stay Omit-ed (a compile error). The flat `provider`/`model`/.../`seed`
   * fields above win over the same keys here (they are the existing curated path;
   * this is the ADDITIVE escape hatch beneath them — the Tier-2 nest reshape that
   * collapses both into one `render: RenderOptions` is a separate, later step).
   * Ignored when {@link buildRender} is supplied (the offline fake owns its body).
   */
  readonly renderOptions?: RenderOptions;
}

/** Input to {@link runProject}: the compiled project + the run substrate. */
export interface RunProjectInput {
  /** The output of {@link compileProject}. */
  readonly compiled: CompiledProject;
  /**
   * The blessed persistence primitive (clock + storage + world-model + ledger).
   * Supply a whole {@link Substrate} (`fileSystemSubstrate` / `inMemorySubstrate`)
   * or a `Partial<Substrate>`; missing pieces default. Prefer this over
   * {@link RunProjectInput.adapters}.
   */
  readonly substrate?: Partial<Substrate>;
  /**
   * The durable substrate (clock + storage + optional world-model store +
   * optional ledger). The à-la-carte form retained for back-compat;
   * {@link RunProjectInput.substrate} is the blessed superset.
   */
  readonly adapters?: {
    readonly clock: ClockAdapter;
    readonly storage: StorageAdapter;
    readonly worldModel?: WorldModelStore;
    readonly ledger?: MutableReceiptLedger;
  };
  /** The world-model directory (when the world-model store is defaulted). */
  readonly directory?: string;
  /** The render wiring. */
  readonly render: RunProjectRender;
}

/** The booted project: the typed reactor handle + the boot sweep's results. */
export interface RunProjectResult {
  readonly reactor: Reactor;
  readonly bootResults: readonly ReconcileResult[];
}

/**
 * Mount the compiled project and run its boot cold-miss sweep (PHASE5 §4b). The
 * agent-render is built over the SAME world-model store `createReactor` commits
 * to (so a workspace write is visible to the harvest in that render); each node
 * mounts with `compiledStoreCanonicalizer(perNode[node].compiled.canonicalizer,
 * projectTruth)` — GOTCHA 1 — so a producer's maintained facet actually moves and
 * propagation fires along the edge Forme drew. The boot is `bootAsync` — GOTCHA 2
 * — the honest first render: only sources are seeded; input-driven nodes wake via
 * propagation. A SECOND `runProject` over the same dirs boots to all-skips.
 */
export async function runProject(
  input: RunProjectInput,
): Promise<RunProjectResult> {
  const { compiled, render } = input;

  // Merge the blessed `substrate` with the back-compat à-la-carte `adapters`;
  // `adapters` fields win when both supply the same key. `clock` + `storage` are
  // required (one of the two sources must provide each).
  const substrate = input.substrate ?? {};
  const adapters = input.adapters;
  const clock = adapters?.clock ?? substrate.clock;
  const storage = adapters?.storage ?? substrate.storage;
  if (clock === undefined || storage === undefined) {
    throw new TypeError(
      "runProject requires a clock + storage (via substrate or adapters)",
    );
  }

  // The store the render writes to MUST be the store the reactor commits to, so
  // the render's workspace write is visible to the harness harvest. When the
  // caller injects a store, use it; otherwise default to the FS store over
  // `directory` (constructed here so the render and reactor share the instance).
  const store = resolveStore(input);
  // A supplied ledger (substrate or adapters) is the explicit opt-out; otherwise
  // `createReactor` derives the durable ledger over `storage` (restart-survival).
  const ledger = adapters?.ledger ?? substrate.ledger;

  const contractFor = render.contractFor ?? defaultContractFor(compiled);
  const projectTruthFor =
    render.projectTruthFor ?? (() => EMPTY_PROJECTION);

  // The render body: the injected factory (offline fake) or the live agent-render
  // over the SHARED store. Building over `store` is load-bearing — the render's
  // workspace write must be visible to the harness harvest in that same render.
  const agentRender = render.buildRender
    ? render.buildRender(store)
    : createAgentRender({
        store,
        contractFor,
        // The full `@openai/agents` escape hatch FIRST (lowest precedence) so the
        // existing flat curated fields below still win over the same keys — this
        // is the additive passthrough beneath the curated path.
        ...(render.renderOptions ?? {}),
        ...(render.provider !== undefined ? { provider: render.provider } : {}),
        ...(render.model !== undefined ? { model: render.model } : {}),
        ...(render.skill !== undefined ? { skill: render.skill } : {}),
        ...(render.skillPath !== undefined
          ? { skillPath: render.skillPath }
          : {}),
        ...(render.temperature !== undefined
          ? { temperature: render.temperature }
          : {}),
        ...(render.seed !== undefined ? { seed: render.seed } : {}),
        ...(render.maxTurns !== undefined ? { maxTurns: render.maxTurns } : {}),
        // Change C: thread the caller's render sandbox + shell timeout through to
        // createAgentRender. Both are OPTIONAL and spread the same way every other
        // knob is — unset means the construction is byte-for-byte what it was today.
        ...(render.sandbox !== undefined ? { sandbox: render.sandbox } : {}),
        ...(render.shellTimeoutMs !== undefined
          ? { shellTimeoutMs: render.shellTimeoutMs }
          : {}),
      });

  // GOTCHA 1: mount each node with the canonicalizer its canonicalizer-SESSION
  // emitted — `compiledStoreCanonicalizer` over the per-node compiled
  // canonicalizer — NOT `atomicCanonicalizer`. With atomic, `movedFacets` is
  // empty and a subscriber on a named facet never wakes.
  const asyncMounts: Record<string, AsyncNodeMount> = {};
  for (const node of compiled.reconcilerTopology.topology.nodes) {
    const nodeId = node.node;
    const perNode = compiled.perNode[nodeId];
    if (perNode === undefined) {
      throw new Error(
        `run-project: no compiled artifacts for topology node '${nodeId}'`,
      );
    }
    asyncMounts[nodeId] = {
      render: agentRender,
      canonicalizer: compiledStoreCanonicalizer(
        perNode.compiled.canonicalizer,
        projectTruthFor(nodeId),
      ),
    };
  }

  const reactor = createReactor({
    adapters: {
      clock,
      storage,
      worldModel: store,
      ...(ledger !== undefined ? { ledger } : {}),
    },
    topology: compiled.reconcilerTopology,
    asyncMounts,
  });

  // GOTCHA 2: boot() is the honest FIRST render of a pure source (a bare re-wake
  // of a source memo-skips on (contract_fp, [])). Only sources are seeded; the
  // input-driven subscriber wakes via the producer's propagated facet. The handle
  // drive verbs are async-by-default, so `boot()` IS the async cold-miss sweep.
  const bootResults = await reactor.boot();

  return { reactor, bootResults };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/** The empty truth projection (a node with no structured backing on disk). */
const EMPTY_PROJECTION: TruthProjection = () => ({});

function resolveContracts(input: CompileProjectInput): ContractSet {
  if (input.contracts !== undefined) {
    return input.contracts;
  }
  if (typeof input.contractsDir === "string" && input.contractsDir.length > 0) {
    return loadContractSet(input.contractsDir);
  }
  throw new TypeError(
    "compileProject requires either `contracts` or a `contractsDir`",
  );
}

/**
 * Derive a stable per-node contract fingerprint from the contract's source text
 * via the existing `contentAddressOf` content-address primitive. The serialized
 * source is the contract's `path` + section bodies in a fixed order — a
 * deterministic byte image keyed to the contract's identity-bearing fields.
 */
function deriveContractFingerprints(
  contracts: ContractSet,
): Record<string, Fingerprint> {
  const out: Record<string, Fingerprint> = {};
  for (const contract of contracts) {
    const image = [
      `id:${contract.id}`,
      `name:${contract.name}`,
      `kind:${contract.kind}`,
      `requires:${contract.requires ?? ""}`,
      `maintains:${contract.maintains ?? ""}`,
      `continuity:${contract.continuity ?? ""}`,
      `execution:${contract.execution ?? ""}`,
      `criteria:${contract.criteria ?? ""}`,
    ].join("\n");
    out[contract.id] = asFingerprint(
      contentAddressOf(new TextEncoder().encode(image)),
    );
  }
  return out;
}

function mergeOptions(
  base: CompileStepOptions,
  override: CompileStepOptions | undefined,
): CompileStepOptions {
  if (override === undefined) {
    return base;
  }
  return { ...base, ...override };
}

function resolveNodeStepOptions(
  step:
    | CompileStepOptions
    | Readonly<Record<string, CompileStepOptions>>
    | undefined,
  node: string,
): CompileStepOptions | undefined {
  if (step === undefined) {
    return undefined;
  }
  if (isPerNodeOptions(step)) {
    return step[node];
  }
  return step;
}

/**
 * Distinguish a per-NODE map of options from a single `CompileStepOptions`. A
 * `CompileStepOptions` only ever carries known session knobs (provider/model/
 * skill/temperature/seed/maxTurns); a per-node map is keyed by node id. We treat
 * a record whose own keys are all NON-session keys as a per-node map.
 */
function isPerNodeOptions(
  value: CompileStepOptions | Readonly<Record<string, CompileStepOptions>>,
): value is Readonly<Record<string, CompileStepOptions>> {
  const SESSION_KEYS = new Set([
    "provider",
    "model",
    "skill",
    "skillPath",
    "temperature",
    "seed",
    "maxTurns",
  ]);
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return false;
  }
  return keys.every((k) => !SESSION_KEYS.has(k));
}

function resolveStore(input: RunProjectInput): WorldModelStore {
  // `adapters.worldModel` wins (back-compat override), then `substrate.worldModel`.
  const worldModel = input.adapters?.worldModel ?? input.substrate?.worldModel;
  if (worldModel !== undefined) {
    return worldModel;
  }
  // No injected store: defer to createReactor's defaulting by constructing the
  // SAME default the assembler would. We construct it HERE so the render shares
  // the instance (the render must write into the store the reactor commits to).
  // Mirror create-reactor's contract: a `directory` is required.
  const directory = input.directory;
  if (typeof directory !== "string" || directory.length === 0) {
    throw new TypeError(
      "runProject requires either adapters.worldModel or a `directory` for the default world-model store",
    );
  }
  return new FileSystemWorldModelStore({ directory });
}

/**
 * Derive a minimal per-node {@link CompiledContractView} from the loaded contract
 * + Forme's topology when the caller does not supply one. The view is the
 * instruction layer the render carries; the load-bearing run-time behavior
 * (materiality, propagation) comes from the COMPILED canonicalizer, not this
 * view, so a coarse projection of the verbatim section bodies is sufficient.
 */
function defaultContractFor(
  compiled: CompiledProject,
): (node: string) => CompiledContractView {
  const byId = new Map(compiled.contracts.map((c) => [c.id, c]));
  return (node: string): CompiledContractView => {
    const contract = byId.get(node);
    const name = contract?.name ?? node;
    const maintains = contract?.maintains ? [contract.maintains] : [];
    const requires = contract?.requires ? [contract.requires] : [];
    const view: Record<string, unknown> = { name, maintains, requires };
    if (contract?.continuity !== undefined) {
      view["continuity"] = contract.continuity;
    }
    if (contract?.execution !== undefined) {
      view["execution"] = contract.execution;
    }
    return view as unknown as CompiledContractView;
  };
}

/** Re-export the workspace file shape so a caller's projectTruth typing aligns. */
export type { WorldModelFiles };
