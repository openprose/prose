// The mounted DAG — the reactor front door.
//
// The render atom mounted as a node in the reactor DAG, woken over time
// (architecture.md §1 L32 "mounted — a node in the reactor DAG"). Mounting is
// additive (architecture.md §1 L34–L40): it ADDS identity + a persisted
// world-model + resolved subscriptions to the same render atom (`render-atom.ts`)
// that runs standalone. This file wires the dumb reconciler (`../reactor`) over
// the world-model store (`../world-model`) and a node-scoped receipt ledger, and
// exposes the run-phase surface:
//
//   - `ingest(wake)` — deliver a wake (input / external) and reconcile to a
//     fixpoint, propagating along the topology edges (architecture.md §4.1).
//   - `tick(node)`   — emit a self-sourced wake (the continuity clock / forecast
//     cadence, architecture.md §4.2 L181–L191) and reconcile.
//
// There is NO judge, NO policy, NO exit-bundle. The reconciler's whole decision
// is fingerprint comparison (delta.md §A0; architecture.md §4.1). The reconciler
// itself (single-flight, coalescing, propagation-by-topology-edge) is the
// sibling module `../reactor`; this front door supplies its ports and turns
// `RenderProduct`s into committed world-models + receipts.
//
// Source of truth: architecture.md §1 (mounting is additive), §4.1 (reconciler),
// §4.2 (continuity / self-driven), §5.1 (receipt + ledger), §5.2 (world-model
// store), §6.3 (topology edges); world-model.md §4 (memo key), §5 (wake sources),
// §8 (only moved propagates); delta.md Part A; SHAPES.md §3/§4/§5/§6.

import {
  type ContentAddress,
  type Cost,
  type Fingerprint,
  type InputFingerprints,
  type TopologyEdge,
  type Wake,
  type WakeSource,
} from "../shapes";
import {
  createReconciler,
  type ReconcileResult,
  type ReconcilerHandle,
  type ReconcilerPorts,
  type ReconcilerTopology,
  type ReceiptLedgerPort,
  type RenderRequest,
  type WakeEvent,
  type WorldModelStorePort,
} from "../reactor";
import {
  computeReceiptContentHash,
  createReceipt,
  type LedgerReceipt,
  type Receipt,
} from "../receipt";
import {
  budgetExhaustedCost,
  createBudgetTracker,
  type ReactorBudget,
  type ReactorBudgetOption,
} from "../cost/budget";
import {
  atomicCanonicalizer,
  resolveFacetFingerprint,
  COLD_START_FINGERPRINTS,
  type Canonicalizer,
  type WorldModelStore,
  InMemoryWorldModelStore,
} from "../world-model";
import {
  compiledStoreCanonicalizer,
  type RenderContext,
  type RenderFailure,
  type RenderProduct,
  type TruthProjection,
} from "./render-atom";

// Re-exported from the mounted front door so a caller wiring a compiled DAG can
// thread each node's COMPILED canonicalizer into its `NodeMount.canonicalizer`
// (architecture.md §3.2 / §5.2) from the single mounted-DAG import surface.
export { compiledStoreCanonicalizer, type TruthProjection };

// ---------------------------------------------------------------------------
// The mounted render: the same atom body, woken by the harness
// ---------------------------------------------------------------------------

/**
 * The render the caller mounts per node. It is the SAME `(context) → product`
 * body as the standalone atom (`render-atom.ts`); the harness adds identity,
 * subscriptions, and persistence around it (architecture.md §1 L34–L40). The
 * harness commits the returned `RenderProduct` to the world-model store and signs
 * the receipt; a `RenderFailure` (or a throw) commits nothing.
 */
export type MountedRender = (
  context: RenderContext,
) => RenderProduct | RenderFailure;

/**
 * The ASYNC mounted render. A real render IS one bounded
 * OpenAI-Agents-SDK session = one `await run(...)`, so the agent-render factory
 * produces this shape. A sync render is trivially an already-resolved promise,
 * so an `AsyncMountedRender` can wrap a sync one. The harness drives it through
 * the async reconcile path (`ingestAsync`/`tickAsync`/`drainAsync`).
 */
export type AsyncMountedRender = (
  context: RenderContext,
) => Promise<RenderProduct | RenderFailure>;

/** Per-node mount: the render body and its compiled canonicalizer. */
export interface NodeMount {
  readonly render: MountedRender;
  /** Defaults to the atomic whole-truth canonicalizer (the no-facet case). */
  readonly canonicalizer?: Canonicalizer;
}

/**
 * Per-node mount for the ASYNC path: an `AsyncMountedRender` body and its
 * compiled canonicalizer. Used when the caller drives `ingestAsync`/`tickAsync`/
 * `drainAsync` with a live agent render.
 */
export interface AsyncNodeMount {
  readonly render: AsyncMountedRender;
  /** Defaults to the atomic whole-truth canonicalizer (the no-facet case). */
  readonly canonicalizer?: Canonicalizer;
}

/**
 * RESERVED FORWARD SEAM (type-only; nothing built ahead). The resolver form of a
 * mount map: `(node) => NodeMount | undefined`. The FIXPOINT milestone
 * (architecture.md §11) needs a mount for a node SPAWNED by an epoch rollover —
 * one not present in the boot-time record. A resolver supplies it on demand.
 *
 * {@link ReservedMounts} (below) is the strict SUPERSET of today's
 * `Record<string, NodeMount>`: a record is the eager resolver. `mountDag`'s
 * runtime accepts ONLY the record in `0.3.0` (build nothing ahead); when the
 * milestone lands, {@link MountDagInput.mounts} widens to {@link ReservedMounts}
 * ADDITIVELY (a record is already a valid `ReservedMounts`), so no current
 * caller breaks. Declared, NOT consumed.
 */
export type NodeMountResolver = (node: string) => NodeMount | undefined;

/** The async sibling of {@link NodeMountResolver} (RESERVED, type-only). */
export type AsyncNodeMountResolver = (
  node: string,
) => AsyncNodeMount | undefined;

/**
 * RESERVED FORWARD SEAM (type-only). The additive superset
 * {@link MountDagInput.mounts} widens to when dynamic mounts land: either the
 * boot-time record (today's only accepted form) OR a {@link NodeMountResolver}.
 */
export type ReservedMounts =
  | Readonly<Record<string, NodeMount>>
  | NodeMountResolver;

/** The async sibling of {@link ReservedMounts} (RESERVED, type-only). */
export type ReservedAsyncMounts =
  | Readonly<Record<string, AsyncNodeMount>>
  | AsyncNodeMountResolver;

export interface MountDagInput {
  /** The compiled topology (Forme's output) + per-node contract fingerprints. */
  readonly topology: ReconcilerTopology;
  /** The render body per node identity (the SYNC path). */
  readonly mounts: Readonly<Record<string, NodeMount>>;
  /**
   * The ASYNC render body per node identity. OPTIONAL: supply this to drive
   * `ingestAsync`/`tickAsync`/`drainAsync` with live agent renders. When a node
   * is present in `asyncMounts` the async spawn uses it; otherwise the async
   * spawn falls back to the sync `mounts` entry (wrapping its synchronous render
   * in a resolved promise), so a caller can mix live and fake renders.
   */
  readonly asyncMounts?: Readonly<Record<string, AsyncNodeMount>>;
  /**
   * The world-model store. Defaults to a fresh in-memory store — the mounted
   * DAG is self-contained for tests (architecture.md §5.3: tests inject fakes).
   */
  readonly store?: WorldModelStore;
  /**
   * The receipt ledger. Defaults to a fresh in-memory ledger (the node-scoped
   * append-only receipt trail, architecture.md §5.1).
   */
  readonly ledger?: MutableReceiptLedger;
  /**
   * EXPERIMENT A (opt-in, default OFF): the enforced fresh-token ceiling for
   * this mounted reactor's SESSION. When set, a render dispatch past the
   * ceiling REFUSES — a zero-cost `failed` receipt is committed (prior truth
   * stands, no propagation) instead of spawning the render. Memo-skips happen
   * in the reconciler before any spawn and are never blocked or charged.
   */
  readonly budget?: ReactorBudgetOption;
}

/**
 * The mounted reactor — the run-phase front door. `ingest` and `tick` are the
 * two ways a wake enters; both reconcile to a fixpoint and return the per-node
 * results (architecture.md §4.1).
 */
export interface MountedDag {
  /**
   * Deliver a wake for a node and reconcile to a fixpoint (memo/skip, schedule,
   * commit, propagate, architecture.md §4.1). The wake's default source is
   * `external` (a gateway / manual trigger turned into an edge receipt,
   * world-model.md §5); pass `input`/`external`/`self` explicitly as needed.
   */
  readonly ingest: (node: string, wake?: Wake) => readonly ReconcileResult[];
  /**
   * Emit a SELF-sourced wake for a node — the continuity clock / forecast
   * cadence (architecture.md §4.2 L181–L191). A tick that finds no material move
   * writes an unmoved fingerprint and stops (the reconciler skips it).
   */
  readonly tick: (node: string) => readonly ReconcileResult[];
  /** Drain an arbitrary set of seed wakes (e.g. a boot cold-miss sweep). */
  readonly drain: (initial: readonly WakeEvent[]) => readonly ReconcileResult[];
  /**
   * The ASYNC sibling of `ingest`. Awaits the live agent render(s) the wake
   * reaches. Same memo/skip/schedule/commit/propagate semantics as `ingest`,
   * but the render is a bounded LLM session.
   */
  readonly ingestAsync: (
    node: string,
    wake?: Wake,
  ) => Promise<readonly ReconcileResult[]>;
  /** The ASYNC sibling of `tick` — a self-sourced wake driven through the async path. */
  readonly tickAsync: (node: string) => Promise<readonly ReconcileResult[]>;
  /** The ASYNC sibling of `drain` — a serialized async fixpoint over seed wakes. */
  readonly drainAsync: (
    initial: readonly WakeEvent[],
  ) => Promise<readonly ReconcileResult[]>;
  /** The node-scoped receipt ledger (a node's durable memory). */
  readonly ledger: MutableReceiptLedger;
  /** The world-model store (the canonical maintained truth). */
  readonly store: WorldModelStore;
  /** The underlying reconciler (for advanced callers). */
  readonly reconciler: ReconcilerHandle;
  /**
   * The Workflow-shaped budget accessor — `total` / `spent()` / `remaining()`
   * (null/Infinity semantics when no {@link MountDagInput.budget} was set).
   * OPTIONAL on the interface so hand-built structural `MountedDag` values
   * keep compiling; `mountDag` always supplies it.
   */
  readonly budget?: ReactorBudget;
}

/**
 * Mount a set of contracts as a reactor DAG (architecture.md §1 L32). Wires the
 * dumb reconciler over the world-model store + receipt ledger, with a
 * `SpawnRender` that runs the per-node render, commits its world-model, and a
 * `ResolveInputFingerprints` that reads the upstream published facets from the
 * topology edges.
 */
export function mountDag(input: MountDagInput): MountedDag {
  const store = input.store ?? new InMemoryWorldModelStore();
  const ledger = input.ledger ?? new InMemoryReceiptLedger();
  // EXPERIMENT A: one session-scoped budget tracker per mounted reactor. With
  // no `input.budget` this is the unlimited tracker (`exhausted()` always
  // false), so the guards below are inert and behavior is identical to today.
  const budget = createBudgetTracker(input.budget);

  const worldModelPort: WorldModelStorePort = {
    publishedRef: (node) => store.ref(node, "published"),
  };

  // The SpawnRender port: run the mounted render, COMMIT its world-model to the
  // store (write-and-fingerprint, architecture.md §5.2), and hand the reconciler
  // the resulting WorldModelCommit. The reconciler signs + appends the receipt;
  // a render failure (or a throw) commits nothing and the prior truth stands
  // (architecture.md §4.1 L173–L175).
  const spawnRender: ReconcilerPorts["spawnRender"] = (request) => {
    const mount = input.mounts[request.node];
    if (mount === undefined) {
      return {
        status: "failed",
        reason: `no render mounted for node "${request.node}"`,
        cost: noneCost(request.wake.source),
      };
    }
    const canonicalizer = mount.canonicalizer ?? atomicCanonicalizer;
    // EXPERIMENT A: refuse the dispatch once the session ceiling is reached —
    // fail closed (a zero-cost failed outcome the reconciler turns into a
    // failed receipt: fingerprint unmoved, prior truth stands, no propagation).
    // The memo-skip decision happened in the reconciler BEFORE this port, so a
    // skip is structurally never blocked or charged.
    if (budget.exhausted()) {
      return {
        status: "failed",
        reason: budgetExhaustedReason(budget.view),
        cost: budgetExhaustedCost(request.wake.source),
      };
    }
    const product = runMountedRender(mount.render, toRenderContext(request, store));
    // Charge the outcome's fresh tokens (rendered AND failed — a failed live
    // render may still have burned tokens; this is the exact cost object the
    // reconciler stamps into the committed receipt, so budget truth equals
    // receipt truth).
    budget.charge(product.cost);
    if (isFailure(product)) {
      return {
        status: "failed",
        reason: product.reason,
        cost: product.cost,
      };
    }
    const commit = store.commitPublished(
      request.node,
      product.world_model,
      canonicalizer,
    );
    return {
      status: "rendered",
      commit,
      semantic_diff: product.semantic_diff ?? {},
      cost: product.cost,
    };
  };

  // The ASYNC SpawnRender port. Mirrors the sync `spawnRender` above — run the
  // render, COMMIT its world-model, hand the reconciler the WorldModelCommit —
  // but AWAITS the render (a bounded LLM session). Prefers an `asyncMounts`
  // entry; falls back to the sync `mounts` render (wrapped in a resolved promise)
  // so live and fake renders can mix.
  const spawnRenderAsync: ReconcilerPorts["spawnRenderAsync"] = async (
    request,
  ) => {
    const asyncMount = input.asyncMounts?.[request.node];
    const syncMount = input.mounts[request.node];
    if (asyncMount === undefined && syncMount === undefined) {
      return {
        status: "failed",
        reason: `no render mounted for node "${request.node}"`,
        cost: noneCost(request.wake.source),
      };
    }
    const canonicalizer =
      (asyncMount ?? syncMount)?.canonicalizer ?? atomicCanonicalizer;
    // EXPERIMENT A: the same dispatch-time refusal as the sync spawn above —
    // fail closed before contacting any provider (skips never reach this port).
    if (budget.exhausted()) {
      return {
        status: "failed",
        reason: budgetExhaustedReason(budget.view),
        cost: budgetExhaustedCost(request.wake.source),
      };
    }
    const context = toRenderContext(request, store);
    const product =
      asyncMount !== undefined
        ? await runAsyncMountedRender(asyncMount.render, context)
        : // A sync render is trivially an already-resolved promise, so the async
          // path subsumes it.
          runMountedRender((syncMount as NodeMount).render, context);
    // Charge the outcome's fresh tokens (rendered AND failed) — see the sync
    // spawn's note: the charged value is the committed receipt's cost verbatim.
    budget.charge(product.cost);
    if (isFailure(product)) {
      return {
        status: "failed",
        reason: product.reason,
        cost: product.cost,
      };
    }
    const commit = store.commitPublished(
      request.node,
      product.world_model,
      canonicalizer,
    );
    return {
      status: "rendered",
      commit,
      semantic_diff: product.semantic_diff ?? {},
      cost: product.cost,
    };
  };

  // The ResolveInputFingerprints port: the memo key's second half. Read each
  // subscribed edge's producer published fingerprint map (from the producer's
  // last receipt — the published-truth identity downstreams subscribe to,
  // world-model.md §4) and resolve the subscribed facet (one slot per subscribed
  // facet, in resolved subscription order — SHAPES.md §3; architecture.md §6.1).
  // This is what the reconciler compares against the node's last receipt to
  // decide skip-vs-render.
  const resolveInputFingerprints: ReconcilerPorts["resolveInputFingerprints"] = (
    _node,
    edges,
  ) => resolveInputs(ledger, edges);

  const ports: ReconcilerPorts = {
    ledger,
    worldModel: worldModelPort,
    spawnRender,
    spawnRenderAsync,
    resolveInputFingerprints,
  };

  const reconciler = createReconciler(ports, input.topology);

  return {
    ingest: (node, wake) =>
      reconciler.drain([{ node, wake: wake ?? defaultExternalWake() }]),
    tick: (node) => reconciler.drain([{ node, wake: selfWake() }]),
    drain: (initial) => reconciler.drain(initial),
    ingestAsync: (node, wake) =>
      reconciler.drainAsync([{ node, wake: wake ?? defaultExternalWake() }]),
    tickAsync: (node) => reconciler.drainAsync([{ node, wake: selfWake() }]),
    drainAsync: (initial) => reconciler.drainAsync(initial),
    ledger,
    store,
    reconciler,
    budget: budget.view,
  };
}

// ---------------------------------------------------------------------------
// The in-memory receipt ledger (implements the reconciler's ReceiptLedgerPort)
// ---------------------------------------------------------------------------

/**
 * A receipt ledger the front door can append to. Extends the reconciler's
 * read-port (`ReceiptLedgerPort`) — the reconciler only reads + appends; this
 * adds an enumeration for inspection/projection.
 */
export interface MutableReceiptLedger extends ReceiptLedgerPort {
  /** All receipts in append order (node-scoped trail). */
  readonly all: () => readonly LedgerReceipt[];
}

/**
 * The reference in-memory ledger (architecture.md §5.1: append-only,
 * content-addressed over its fingerprints-of-meaning, verified before append).
 * The persistent substrate (the `storage` adapter, architecture.md §5.3) is a
 * drop-in behind the same `ReceiptLedgerPort`.
 */
export class InMemoryReceiptLedger implements MutableReceiptLedger {
  readonly #byNode = new Map<string, LedgerReceipt[]>();
  readonly #order: LedgerReceipt[] = [];

  lastReceipt(node: string): Receipt | null {
    const chain = this.#byNode.get(node);
    if (chain === undefined || chain.length === 0) {
      return null;
    }
    return chain[chain.length - 1] as LedgerReceipt;
  }

  append(receipt: Receipt): ContentAddress {
    // Stamp + verify the envelope (content-addressed + verified before append,
    // architecture.md §5.1). `createReceipt` throws on a malformed body.
    const stamped = createReceipt(receipt);
    let chain = this.#byNode.get(stamped.node);
    if (chain === undefined) {
      chain = [];
      this.#byNode.set(stamped.node, chain);
    }
    chain.push(stamped);
    this.#order.push(stamped);
    return stamped.content_hash;
  }

  addressOf(receipt: Receipt): ContentAddress | null {
    // The ledger owns content-addressing (delta.md §A3.2): compute the receipt's
    // content hash over its canonical form. Returns the address whether or not
    // the receipt was appended (the reconciler uses it for the `prev` pointer).
    return computeReceiptContentHash({
      schema: "openprose.receipt",
      hash_algorithm: "sha256",
      node: receipt.node,
      contract_fingerprint: receipt.contract_fingerprint,
      wake: receipt.wake,
      input_fingerprints: receipt.input_fingerprints,
      fingerprints: receipt.fingerprints,
      semantic_diff: receipt.semantic_diff,
      prev: receipt.prev,
      status: receipt.status,
      cost: receipt.cost,
      sig: receipt.sig,
    });
  }

  all(): readonly LedgerReceipt[] {
    return [...this.#order];
  }
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

/**
 * Resolve the consumed-facet tuple for a node from its inbound topology edges
 * (architecture.md §6.3 L256–L261): for each edge, read the producer's CURRENT
 * published fingerprint map — the `fingerprints` on the producer's last receipt,
 * which IS the published-truth identity downstreams subscribe to (world-model.md
 * §4) — and resolve the subscribed facet. A producer that has not rendered yet
 * exposes the cold-start atomic fingerprint (architecture.md §8 L335–L337), so a
 * subscriber always sees a valid "no data yet" state. The order is the edge order
 * (the resolved subscription order, SHAPES.md §3) so the tuple is stable across
 * renders.
 */
export function resolveInputs(
  ledger: ReceiptLedgerPort,
  edges: readonly TopologyEdge[],
): InputFingerprints {
  const out: Fingerprint[] = [];
  for (const edge of edges) {
    const producerReceipt = ledger.lastReceipt(edge.producer);
    const producerFingerprints =
      producerReceipt !== null
        ? producerReceipt.fingerprints
        : COLD_START_FINGERPRINTS;
    out.push(resolveFacetFingerprint(producerFingerprints, edge.facet));
  }
  return out;
}

function toRenderContext(
  request: RenderRequest,
  store: WorldModelStore,
): RenderContext {
  return {
    node: request.node,
    contract_fingerprint: request.contract_fingerprint,
    wake: request.wake,
    input_fingerprints: request.input_fingerprints,
    inbound_edges: request.inbound_edges,
    prior: store.read(request.node, "published"),
  };
}

function runMountedRender(
  render: MountedRender,
  context: RenderContext,
): RenderProduct | RenderFailure {
  try {
    return render(context);
  } catch (error) {
    return {
      failed: true,
      reason: error instanceof Error ? error.message : String(error),
      cost: noneCost(context.wake.source),
    };
  }
}

/**
 * Run an ASYNC mounted render, mapping a throw (network error, schema-parse
 * failure, max-turns) to a `RenderFailure` — exactly as the sync
 * `runMountedRender` does, so an exhausted/erroring live session degrades to a
 * `failed` receipt with the prior truth standing (architecture.md §4.1).
 */
async function runAsyncMountedRender(
  render: AsyncMountedRender,
  context: RenderContext,
): Promise<RenderProduct | RenderFailure> {
  try {
    return await render(context);
  } catch (error) {
    return {
      failed: true,
      reason: error instanceof Error ? error.message : String(error),
      cost: noneCost(context.wake.source),
    };
  }
}

function isFailure(value: RenderProduct | RenderFailure): value is RenderFailure {
  return (value as RenderFailure).failed === true;
}

/**
 * EXPERIMENT A: the human-readable refusal reason. It rides the in-process
 * `RenderOutcome.reason` (observable to drivers) and is dropped at commit like
 * every other failure reason — the durable marker is the refusal `Cost`
 * (`cost/budget.ts`, queryable via `isBudgetExhaustedReceipt`).
 */
function budgetExhaustedReason(view: ReactorBudget): string {
  return (
    `budget exhausted: spent ${view.spent()} of ${view.total} fresh tokens — ` +
    "render refused, prior truth stands"
  );
}

/** The zero/none cost of a render that produced nothing (a failure or unmounted node). */
function noneCost(source: WakeSource): Cost {
  return {
    provider: "none",
    model: "none",
    tokens: { fresh: 0, reused: 0 },
    surprise_cause: source,
  };
}

function defaultExternalWake(): Wake {
  // A manual / gateway ingress is external-driven (world-model.md §5: "a gateway
  // turning a webhook / cron / manual trigger into an edge receipt").
  return { source: "external", refs: [] };
}

function selfWake(): Wake {
  // The continuity clock's synthetic self-receipt (architecture.md §4.2; world-
  // model.md §5: the node's own continuity clock emits a self-receipt / tick).
  return { source: "self", refs: [] };
}
