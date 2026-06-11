// The dumb reconciler — the run-phase spine of @openprose/reactor.
//
// This module is the GUT+REBUILD of the retired judge/policy spine
// (delta.md §A0/§A3.1). There is NO judge, NO policy artifact, NO predicate
// backstop, NO rollback machinery here. The skip decision *is* the reconciler
// comparing fingerprints (delta.md §A0.1: "The skip decision is the reconciler
// comparing fingerprints").
//
// The reconciler's whole job (architecture.md §4.1):
//   1. MEMO/SKIP   — key = (contract_fingerprint, input_fingerprints), nothing
//                    else. If neither half moved since the node's last receipt,
//                    write a cheap `skipped` receipt and spawn nothing.
//                    "Cost scales with surprise, not the clock."
//   2. SCHEDULE    — single-flight per node; wakes arriving mid-render mark the
//                    node dirty and collapse into ONE follow-up render against
//                    the freshly-moved inputs (single-flight + coalescing,
//                    world-model.md §8).
//   3. COMMIT      — a `rendered` render persists its published world-model,
//                    signs a receipt, and appends it to the node-scoped ledger.
//   4. PROPAGATE   — on a `rendered` receipt whose fingerprint moved, wake the
//                    downstreams subscribed to the moved facet(s), resolved by
//                    reading the topology world-model's edges (architecture.md
//                    §6.3). Only `rendered`-with-a-moved-fingerprint propagates;
//                    `skipped`/`failed` do not.
//
// Source of truth: the shared shapes in ../shapes (SHAPES.md) and
// architecture.md §4 (run phase), §5.1/§5.2 (receipt + world-model store),
// world-model.md §4 (memo key) / §8 (dirty/coalesce / only moved propagates).

import {
  type Cost,
  type ContentAddress,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type MemoKey,
  type Receipt,
  type ReceiptSignature,
  type ReceiptStatus,
  type SemanticDiff,
  type TopologyEdge,
  type TopologyWorldModel,
  type Unbrand,
  type Wake,
  type WakeSource,
  type WorldModelCommit,
  type WorldModelRef,
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
  asFacet,
  asFingerprint,
  asNodeId,
  createNullSignature,
  makeMemoKey,
} from "../shapes";

// ===========================================================================
// Seam ports — the injection boundary (architecture.md §5.3).
//
// The reconciler is a pure function over injected I/O: no hidden network,
// storage, or model calls (architecture.md §5.3). These ports are the seams
// the reconciler consumes; sibling modules (world-model store, the render/
// language layer, the receipt builder, the memo store) own their
// implementations. Integration wires concrete adapters to these ports.
// ===========================================================================

/**
 * The node-scoped append-only receipt ledger (architecture.md §5.1: "the
 * append-only receipt trail — a node's durable memory"). The reconciler reads
 * the node's last receipt (the memo key's first source) and appends every
 * receipt it produces (rendered / skipped / failed). Content-addressed over its
 * fingerprints-of-meaning and verified before append (§5.1).
 */
export interface ReceiptLedgerPort {
  /** The node's most recent receipt, or `null` at cold start (no prior receipt). */
  readonly lastReceipt: (node: string) => Receipt | null;
  /**
   * Append a receipt and return its content address (the `prev` pointer for the
   * next receipt). Verifies chain-consistency before append (architecture.md
   * §5.1); throws on a torn chain.
   */
  readonly append: (receipt: Receipt) => ContentAddress;
  /**
   * The content address of an already-appended receipt — the ledger owns
   * content-addressing (the canonicalize+digest of the receipt), so the
   * reconciler asks for the `prev` pointer rather than recomputing it
   * (delta.md §A3.2: the canonicalize/hash machinery is the ledger's, not the
   * reconciler's). Returns `null` if the receipt is not in the ledger.
   */
  readonly addressOf: (receipt: Receipt) => ContentAddress | null;
}

/**
 * The per-node world-model store (architecture.md §5.2; delta.md §A5). Read by
 * reference (hand the render a queryable location), write-and-fingerprint on
 * commit, content-addressed versioning. The reconciler never reads the truth
 * into context; it only locates it and learns the post-commit fingerprints.
 */
export interface WorldModelStorePort {
  /** A reference to the node's prior published world-model (cold start = empty + null version). */
  readonly publishedRef: (node: string) => WorldModelRef;
}

/**
 * What the language layer (a render) returns to the harness (architecture.md
 * §1 seam, §7.3). The render reads evidence + the prior world-model by
 * reference, writes the new world-model into its private workspace, leaves its
 * `### Maintains` postconditions satisfied, and signals `rendered` or `failed`.
 * `skipped` is NEVER a render signal — it is the reconciler's pre-render
 * decision (architecture.md §1, §4.1). The harness never asks an LLM "did this
 * change."
 */
export type RenderOutcome =
  | {
      readonly status: "rendered";
      /** The committed published world-model (location + fingerprints). */
      readonly commit: WorldModelCommit;
      /** Render-input context for the receipt; never a wake signal. */
      readonly semantic_diff: SemanticDiff;
      /** Mechanical token attribution observed during the render. */
      readonly cost: Cost;
    }
  | {
      readonly status: "failed";
      /** Why the render committed nothing (error or failed postcondition validator). */
      readonly reason: string;
      readonly cost: Cost;
    };

/**
 * The render request the reconciler hands the language layer: the contract
 * (by fingerprint), the evidence by reference (the waking receipt refs), and
 * the prior world-model by reference (architecture.md §1 seam). No truth is
 * pre-stuffed into context — the render queries it agentically.
 */
export interface RenderRequest {
  readonly node: string;
  readonly contract_fingerprint: Fingerprint;
  readonly wake: Wake;
  /** The resolved consumed-facet tuple (memo key's second half) at render start. */
  readonly input_fingerprints: InputFingerprints;
  /**
   * The node's resolved inbound topology edges (producer + facet) — the
   * subscriptions whose facet fingerprints made up `input_fingerprints`
   * (architecture.md §6.3; SHAPES.md §3). The render reads upstream truth BY
   * REFERENCE through these (a subscriber may read ONLY a producer it subscribes
   * to — the read-isolation pin, architecture.md §4.2 / world-model.md §1). Order
   * is the resolved subscription order, in lockstep with `input_fingerprints`.
   */
  readonly inbound_edges: readonly TopologyEdge[];
  /** Prior world-model, by reference. */
  readonly prior_world_model: WorldModelRef;
}

/**
 * Spawn one render (the language layer). The reconciler stays dumb: it never
 * inspects the render's reasoning, only its outcome. Single render per node in
 * flight (single-flight is enforced by the reconciler, §4.1).
 */
export type SpawnRender = (request: RenderRequest) => RenderOutcome;

/**
 * The async render spawn (architecture.md §1 seam). A real render is one bounded
 * LLM session = one `await run(...)`, so the production spawn returns a
 * `Promise<RenderOutcome>`. A sync render is trivially an already-resolved
 * promise, so this async shape subsumes the sync `SpawnRender`.
 */
export type SpawnRenderAsync = (
  request: RenderRequest,
) => Promise<RenderOutcome>;

/**
 * RESERVED FORWARD SEAM (type-only; nothing built ahead). The privileged
 * `active_graph` subscription the FIXPOINT milestone (architecture.md §11) will
 * fill — a notification that the compiled topology was re-derived (a rewire /
 * epoch rollover). v1 holds the topology as a fixed input per scheduling epoch
 * ({@link ReconcilerTopology}); "an epoch *names* that fact." When the fixpoint
 * lands, the reconciler reports a pending rollover through this callback rather
 * than a breaking {@link ReconcileResult} reshape — the memo key already absorbs
 * a rewire as relocated `input_fingerprints` with no `Receipt`-field change.
 *
 * Declared, NOT consumed — no reconciler path invokes it in `0.3.0`.
 */
export type OnTopologyMoved = (next: ReconcilerTopology) => void;

/**
 * Resolve the consumed-facet tuple for a node from the current published truth
 * of its upstreams (the memo key's second half — one slot per subscribed
 * facet, in resolved subscription order, SHAPES.md §3). The reconciler reads
 * the topology edges to know *which* facets; this port returns their *current*
 * fingerprints so the reconciler can compare them against the node's last
 * receipt.
 */
export type ResolveInputFingerprints = (
  node: string,
  edges: readonly TopologyEdge[],
) => InputFingerprints;

// The single production `ResolveInputFingerprints` is ledger-sourced:
// `resolveInputs` in `sdk/mounted-dag.ts`, which `mountDag` binds the
// reconciler's `resolveInputFingerprints` port to. Per inbound edge it reads the
// producer's last receipt `.fingerprints` (the published-truth identity
// downstreams subscribe to, world-model.md §4) and resolves the subscribed facet
// (architecture.md §6.3; world-model.md §3). There is exactly ONE such resolver —
// no parallel store-sourced resolver — so the run-half input-fingerprint
// resolution has a single authority (architecture.md §6.1).

// ===========================================================================
// Reconciler configuration + result types
// ===========================================================================

export interface ReconcilerPorts {
  readonly ledger: ReceiptLedgerPort;
  readonly worldModel: WorldModelStorePort;
  readonly spawnRender: SpawnRender;
  readonly resolveInputFingerprints: ResolveInputFingerprints;
  /**
   * The async render spawn (Phase-1 live execution). OPTIONAL and additive: a
   * wiring that only drives the synchronous `reconcile`/`drain` need not supply
   * it (every existing test stays green). The async `reconcileAsync`/`drainAsync`
   * prefer this when present and fall back to wrapping the sync `spawnRender` in
   * an already-resolved promise when absent — so the async path subsumes the sync
   * one without forcing every caller to migrate at once (05 §5 Phase A).
   */
  readonly spawnRenderAsync?: SpawnRenderAsync;
  /**
   * RESERVED FORWARD SEAM (type-only; OPTIONAL, nothing built ahead). The
   * fixpoint's privileged `active_graph` subscription — exactly the
   * optional-additive pattern already set by {@link spawnRenderAsync} above. The
   * reconciler does NOT invoke it in `0.3.0`; it is declared so the FIXPOINT
   * milestone (architecture.md §11) lands as a new optional port rather than a
   * breaking {@link ReconcilerPorts} reshape. See {@link OnTopologyMoved}.
   */
  readonly onTopologyMoved?: OnTopologyMoved;
}

/**
 * EXPERIMENT B (spec 02 Part III §9, Change B): opt-in construction options for
 * {@link createReconciler}. Additive — omitting the bag (or every field) keeps
 * today's behavior byte-for-byte.
 */
export interface ReconcilerOptions {
  /**
   * The maximum number of node renders one `drainAsync` may hold in flight at
   * once. Default `1` — the serialized loop, byte-for-byte today's behavior.
   * Values > 1 let nodes that are SIMULTANEOUSLY ready (all dirty producers
   * settled) render concurrently within one drain; dependent nodes still wait
   * for their upstream settle (the frontier's readiness gate IS the topological
   * ordering), per-node single-flight + dirty-coalescing are preserved
   * untouched, and memo-skips stay free (the skip decision runs inside
   * `reconcileAsync` before any render spawns). Affects ONLY `drainAsync`;
   * `drain` / `reconcile` / `reconcileAsync` are unchanged. When > 1, the
   * drain's results arrive in COMPLETION order (not fire order) — compare by
   * node, not by index. Must be an integer >= 1 (TypeError otherwise — fail
   * closed). NOTE: the pool assumes the ledger/store commit seams stay
   * synchronous (they are today); an async storage seam would need a commit
   * lock here.
   */
  readonly maxConcurrency?: number;
}

/**
 * The reconciler's view of the compiled DAG (architecture.md §6.3). v1 holds
 * the topology as a fixed input per scheduling epoch (architecture.md §2: "the
 * topology a fixed input per scheduling epoch — no topology-changes-mid-
 * propagation race"). Forme (a compile-phase render) produces it; the
 * reconciler only *reads* its edges + contract fingerprints.
 */
export interface ReconcilerTopology {
  readonly topology: TopologyWorldModel;
  readonly contract_fingerprints: Readonly<Record<string, Fingerprint>>;
}

/** A wake delivered to the reconciler (one event, three sources). */
export interface WakeEvent {
  readonly node: string;
  readonly wake: Wake;
}

/**
 * The reconciler's decision for a single node after handling a wake.
 * `skipped`   — inputs unmoved; cheap receipt written, nothing spawned.
 * `rendered`  — a render committed a moved (or cold-start) world-model.
 * `failed`    — a render committed nothing; prior truth stands.
 * `coalesced` — a wake arrived mid-render; folded into the in-flight render's
 *               follow-up (single-flight + coalescing, §4.1).
 */
export type ReconcileDisposition =
  | "skipped"
  | "rendered"
  | "failed"
  | "coalesced";

export interface ReconcileResult {
  readonly node: string;
  readonly disposition: ReconcileDisposition;
  /** The receipt written this turn (absent for `coalesced`, which writes none yet). */
  readonly receipt?: Receipt;
  /** The receipt's content address in the ledger (absent for `coalesced`). */
  readonly receipt_ref?: ContentAddress;
  /** Downstream nodes woken by a moved fingerprint (empty unless `rendered` + moved). */
  readonly propagated: readonly WakeEvent[];
}

// ===========================================================================
// The reconciler
// ===========================================================================

/**
 * Per-node single-flight state (architecture.md §4.1: "one render in flight per
 * node; wakes arriving mid-render mark the node dirty and collapse into one
 * follow-up render"). This is reconciler state; on crash it is re-derived from
 * unconsumed upstream receipts (the ledger is the source of truth,
 * architecture.md §8).
 */
interface NodeFlightState {
  inFlight: boolean;
  /** Set when a wake lands mid-render; the single coalesced follow-up consumes it. */
  dirty: boolean;
  /** The most recent wake observed while in flight — the follow-up renders against it. */
  pendingWake: Wake | null;
}

export interface ReconcilerHandle {
  /**
   * Handle one wake for one node (architecture.md §4.1): memo/skip, schedule
   * (single-flight + coalesce), commit, propagate. Returns the disposition,
   * the receipt written, and any downstream wakes to enqueue.
   */
  readonly reconcile: (event: WakeEvent) => ReconcileResult;
  /**
   * Drain a queue of wakes to a fixpoint, honoring single-flight + coalescing
   * and propagation. Returns the ordered list of per-node results. The caller
   * seeds the queue (e.g. a gateway receipt, a self-tick, a boot cold-miss).
   */
  readonly drain: (initial: readonly WakeEvent[]) => readonly ReconcileResult[];
  /**
   * The ASYNC sibling of `reconcile` (Phase-1 live execution; 05 §1.1). Awaits
   * the render (one bounded LLM session). The single-flight + coalescing
   * machinery is identical to the sync path BUT is now genuinely exercised under
   * interleaving: a wake delivered (from another async caller) while this node's
   * render is in flight observes `inFlight === true`, marks the node dirty, and
   * collapses into exactly ONE coalesced follow-up against the freshest inputs —
   * never a second concurrent render, never a lost wake (05 §1.3).
   */
  readonly reconcileAsync: (event: WakeEvent) => Promise<ReconcileResult>;
  /**
   * The ASYNC sibling of `drain` — a serialized fixpoint loop that `await`s each
   * `reconcileAsync` fully before shifting the next event (05 §1.2). This
   * preserves today's exact ordering + "one render in flight per node"
   * guarantees; the only difference is the `await`. Parallelizing independent
   * nodes is a deferred optimization (05 §6, out of scope for v1).
   */
  readonly drainAsync: (
    initial: readonly WakeEvent[],
  ) => Promise<readonly ReconcileResult[]>;
}

/** A plain `input` wake — the fallback delivered to a downstream the drain
 * fires before any producer propagated a wake-carrying receipt to it. */
const INPUT_WAKE: Wake = { source: "input", refs: [] };

/**
 * The compile-time height of every node — Minsky's cheap partial order over the
 * static topology (MK-1). `height(n) = 0` if `n` has no inbound edge (an entry
 * node), else `1 + max(height(producer))`. Memoized DFS with a cycle guard
 * (acyclicity is a compile-time postcondition — architecture.md §2 — but the
 * run-phase throw is O(nodes), runs once per epoch, and is Tenet-5 evidence).
 *
 * The node set MUST be supplied by the caller from `edges ∪ entry_points` (NOT
 * `topology.nodes`, which is `[]` in the compiled IR / tests) so a producer-only
 * or entry-only node still gets a height.
 */
export function computeHeights(
  nodeIds: readonly string[],
  edges: readonly { readonly producer: string; readonly subscriber: string }[],
): Readonly<Record<string, number>> {
  const producersOf: Record<string, string[]> = {};
  for (const n of nodeIds) producersOf[n] = [];
  for (const e of edges) (producersOf[e.subscriber] ??= []).push(e.producer);

  const height: Record<string, number> = {};
  const visiting = new Set<string>();
  const visit = (n: string): number => {
    const cached = height[n];
    if (cached !== undefined) return cached;
    if (visiting.has(n)) {
      throw new Error(
        `reactor: cycle detected at "${n}" — the reconciler topology must be ` +
          "acyclic (architecture.md §2: compile-time acyclicity postcondition).",
      );
    }
    visiting.add(n);
    let h = 0;
    for (const p of producersOf[n] ?? []) h = Math.max(h, visit(p) + 1);
    visiting.delete(n);
    height[n] = h;
    return h;
  };
  for (const n of nodeIds) visit(n);
  return height;
}

/**
 * Construct the dumb reconciler over injected ports + a fixed compiled
 * topology. No judge, no policy, no backstop — the entire decision is
 * fingerprint comparison (delta.md §A0; architecture.md §4.1).
 */
export function createReconciler(
  ports: ReconcilerPorts,
  topology: ReconcilerTopology,
  options: ReconcilerOptions = {},
): ReconcilerHandle {
  const flight = new Map<string, NodeFlightState>();

  // EXPERIMENT B: the drainAsync render-pool width. Default 1 = the serial
  // loop, byte-for-byte today's behavior. Validated eagerly — a malformed
  // width fails closed at construction, never mid-drain.
  const maxConcurrency = options.maxConcurrency ?? 1;
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
    throw new TypeError(
      `reactor: maxConcurrency must be an integer >= 1, got ${String(maxConcurrency)} ` +
        "(EXPERIMENT B, spec 02 Part III §9 — fail closed at construction).",
    );
  }

  const flightFor = (node: string): NodeFlightState => {
    let state = flight.get(node);
    if (state === undefined) {
      state = { inFlight: false, dirty: false, pendingWake: null };
      flight.set(node, state);
    }
    return state;
  };

  // --- MK-1: compile-time height table + producer/subscriber adjacency, the
  // ordering substrate for the height-ordered, dirty-count-gated drain. Derived
  // once here from the FROZEN topology edges ∪ entry_points.
  //
  // static-topology assumption: heights are compile-time constants per scheduling
  // epoch; the fixpoint (C3, architecture.md §11) makes height dynamic — recompute
  // on epoch rollover (createReconciler is already per-epoch), never cache across a
  // rewire. Add NO dynamic-height / pseudo-height / GC-of-orphaned-nodes machinery
  // here (it re-pays the Minsky costs this fix exists to avoid).
  const drainEdges = topology.topology.edges.map((e) => ({
    producer: String(e.producer),
    subscriber: String(e.subscriber),
  }));
  const drainNodeIds = [
    ...new Set<string>([
      ...drainEdges.flatMap((e) => [e.producer, e.subscriber]),
      ...topology.topology.entry_points.map(String),
    ]),
  ];
  const heightOf = computeHeights(drainNodeIds, drainEdges);
  const subscribersOf: Record<string, string[]> = {};
  const producersOf: Record<string, string[]> = {};
  for (const n of drainNodeIds) {
    subscribersOf[n] = [];
    producersOf[n] = [];
  }
  for (const e of drainEdges) {
    (subscribersOf[e.producer] ??= []).push(e.subscriber);
    (producersOf[e.subscriber] ??= []).push(e.producer);
  }

  // PASS 1 of a drain (shared by the sync + async paths): from the seed wakes,
  // mark the transitive-closure DIRTY set and, for each dirty node, count its
  // DISTINCT dirty producers — the number of upstream settle events it must
  // observe before it may fire. Seeds with no dirty producer are ready at once
  // (count 0); an INTERIOR seed (downstream of another seed) keeps a non-zero
  // count and waits on its dirty upstreams — the interior-seed gate that stops
  // the staggered glitch from re-appearing. Pure; only PASS 2's render call
  // differs across sync/async, so the two loops stay split by function color.
  const planDrain = (
    initial: readonly WakeEvent[],
  ): { seedNodes: Set<string>; dirty: Set<string>; remaining: Map<string, number> } => {
    const seedNodes = new Set(initial.map((e) => String(e.node)));
    const dirty = new Set<string>();
    const stack = [...seedNodes];
    while (stack.length > 0) {
      const n = stack.pop() as string;
      if (dirty.has(n)) continue;
      dirty.add(n);
      for (const s of subscribersOf[n] ?? []) {
        if (!dirty.has(s)) stack.push(s);
      }
    }
    const remaining = new Map<string, number>();
    for (const n of dirty) {
      const dirtyProducers = new Set(
        (producersOf[n] ?? []).filter((p) => dirty.has(p)),
      );
      remaining.set(n, dirtyProducers.size);
    }
    return { seedNodes, dirty, remaining };
  };

  // The drain frontier: the per-drain bookkeeping shared by `drain` and
  // `drainAsync`. Everything except the single render call (sync `reconcile` vs
  // `await reconcileAsync`) lives here, so there is ONE implementation of the
  // height ordering, the dirty-count gate, the settle-based decrement, and the
  // move-aware prune — no two-copies drift, and the per-node single-flight guard
  // in `reconcile`/`reconcileAsync` is reused untouched.
  const startFrontier = (initial: readonly WakeEvent[]) => {
    const { seedNodes, dirty, remaining } = planDrain(initial);
    const done = new Set<string>(); // fired OR pruned — removed from the frontier
    const moved = new Set<string>(); // a fired dirty producer propagated to this node
    // EXPERIMENT B: nodes handed out by `next()` whose render is still in
    // flight (pooled drainAsync only — the serial loops never leave a gap
    // between `next()` and `commit()`, so this set is empty on their path).
    const launched = new Set<string>();
    // EXPERIMENT B: at a multi-producer join, the (height, id)-ranked writer of
    // the recorded pending wake — the rank guard in `commit()` keeps the wake
    // refs identical to a serial run even when pooled producers settle out of
    // order. Empty/no-op on the serial path (see the guard's invariance note).
    const wakeWriter = new Map<string, string>();
    const ranksLater = (a: string, b: string): boolean => {
      const ha = heightOf[a] ?? 0;
      const hb = heightOf[b] ?? 0;
      return ha !== hb ? ha > hb : a > b;
    };
    const wakeFor = new Map<string, Wake>();
    for (const e of initial) wakeFor.set(String(e.node), e.wake);
    const maxIter = drainNodeIds.length * 4 + 16;
    let guard = 0;

    return {
      /**
       * The next node to fire: the lowest-height ready node (dirty ∧ not done ∧
       * not in flight ∧ all dirty producers settled), tie-broken by node id for
       * determinism; `null` at quiescence. Throws on the iteration guard
       * (deadlock defense).
       */
      next(): string | null {
        const ready = [...dirty].filter(
          (n) =>
            !done.has(n) && !launched.has(n) && (remaining.get(n) ?? 0) === 0,
        );
        if (ready.length === 0) return null;
        if (++guard > maxIter) {
          throw new Error(
            "reactor: drain exceeded its iteration guard (possible topology deadlock).",
          );
        }
        ready.sort(
          (a, b) => (heightOf[a] ?? 0) - (heightOf[b] ?? 0) || (a < b ? -1 : 1),
        );
        return ready[0] as string;
      },
      /**
       * Does this ready node actually render? A directly-woken seed always fires
       * (its wake IS the move). A downstream fires only if ≥1 dirty producer
       * propagated to it; one whose producers all settled WITHOUT moving it
       * cannot itself have moved — it is PRUNED (no render, no skipped receipt).
       */
      shouldFire(node: string): boolean {
        return seedNodes.has(node) || moved.has(node);
      },
      wakeOf(node: string): Wake {
        return wakeFor.get(node) ?? INPUT_WAKE;
      },
      /**
       * EXPERIMENT B: mark a node handed out by `next()` as in flight so the
       * pooled drain never launches it twice before its `commit()` lands. The
       * serial loops never call this (they commit immediately after firing).
       */
      begin(node: string): void {
        launched.add(node);
      },
      /**
       * Record a processed node: carry a fired node's propagated wakes + mark
       * the movement it caused, mark the node done, then SETTLE its downstreams
       * — decrement EVERY dirty, not-yet-done subscriber whether or not this node
       * moved (a memo-skipping or pruned producer must still settle its
       * subscriber, else a join deadlocks). `result === null` is the prune path:
       * suppress only the render, never the settle bookkeeping.
       */
      commit(node: string, result: ReconcileResult | null): void {
        if (result !== null) {
          for (const p of result.propagated) {
            const target = String(p.node);
            if (!dirty.has(target)) {
              // Under static acyclic topology a propagated wake is always inside
              // the precomputed dirty closure; a target outside it is a topology
              // / propagation bug — surface it rather than silently fold it in.
              throw new Error(
                `reactor: drain propagation reached a non-dirty node "${target}" — ` +
                  "the precomputed dirty closure is incomplete (topology/propagation bug).",
              );
            }
            // EXPERIMENT B: rank-deterministic wake writer at a multi-producer
            // join. Overwrite the pending wake only when this producer ranks
            // LATER in (height, node-id) order than the recorded writer.
            // Serial invariance: the serial frontier fires in strictly
            // ascending (height, id) order (every dirty height-0 node is ready
            // from the start and `next()` always picks lowest, so each height
            // level fully settles before the next), hence each successive
            // propagation already ranks later and the guard always overwrites —
            // identical to the previous unconditional last-writer-wins. Under
            // the pool, arrival order is latency-dependent; the guard keeps the
            // join's recorded wake (and so its receipts) byte-identical to a
            // serial run.
            const recorded = wakeWriter.get(target);
            if (recorded === undefined || ranksLater(node, recorded)) {
              wakeFor.set(target, p.wake);
              wakeWriter.set(target, node);
            }
            moved.add(target);
          }
        }
        done.add(node);
        launched.delete(node);
        for (const s of new Set(subscribersOf[node] ?? [])) {
          if (!dirty.has(s) || done.has(s)) continue;
          const r = remaining.get(s) ?? 0;
          if (r > 0) remaining.set(s, r - 1);
        }
      },
      /** Post-loop sanity: every dirty node must have been fired or pruned. */
      finish(): void {
        const unfinished = [...dirty].filter((n) => !done.has(n));
        if (unfinished.length > 0) {
          throw new Error(
            "reactor: drain left dirty nodes unfired (deadlock): " +
              unfinished.join(","),
          );
        }
      },
    };
  };

  const reconcile = (event: WakeEvent): ReconcileResult => {
    const { node, wake } = event;

    // --- Single-flight + coalescing (architecture.md §4.1; world-model.md §8).
    // If a render for this node is already in flight, this wake does NOT spawn a
    // second render; it marks the node dirty and is collapsed into one follow-up
    // render against the freshly-moved inputs.
    const state = flightFor(node);
    if (state.inFlight) {
      state.dirty = true;
      state.pendingWake = wake;
      return { node, disposition: "coalesced", propagated: [] };
    }

    const contractFp = contractFingerprintFor(topology, node);

    // --- Resolve the memo key's two halves (world-model.md §4; SHAPES.md §3).
    // First half: the contract fingerprint (frozen at compile). Second half: the
    // current consumed-facet tuple, in resolved subscription order.
    const subscribedEdges = inboundEdges(topology.topology, node);
    const inputFingerprints = ports.resolveInputFingerprints(
      node,
      subscribedEdges,
    );
    const key = makeMemoKey(contractFp, inputFingerprints);

    // --- MEMO / SKIP (React.memo-style): compare against the node's last
    // receipt. If neither half of the key moved, write a cheap `skipped` receipt
    // and spawn NOTHING (architecture.md §4.1). "Cost scales with surprise."
    const last = ports.ledger.lastReceipt(node);
    if (last !== null && last.status !== "failed" && !memoKeyMoved(last, key)) {
      const skipped = buildSkippedReceipt({
        node,
        contractFp,
        wake,
        key,
        last,
        prev: ports.ledger.addressOf(last),
      });
      const ref = ports.ledger.append(skipped);
      return {
        node,
        disposition: "skipped",
        receipt: skipped,
        receipt_ref: ref,
        propagated: [],
      };
    }

    // --- SCHEDULE: take the single-flight lock, spawn ONE render.
    state.inFlight = true;
    let result: ReconcileResult;
    try {
      result = renderAndCommit({
        ports,
        topology,
        node,
        contractFp,
        wake,
        key,
        last,
        subscribedEdges,
      });
    } finally {
      state.inFlight = false;
    }

    // --- Coalesced follow-up: a wake that landed mid-render collapses into ONE
    // follow-up render against the freshly-moved inputs (architecture.md §4.1).
    // The follow-up re-runs the full memo/skip path, so an unmoved input simply
    // skips — coalescing never forces a redundant render.
    if (state.dirty) {
      state.dirty = false;
      const followWake = state.pendingWake ?? wake;
      state.pendingWake = null;
      return reconcile({ node, wake: followWake });
    }

    return result;
  };

  const drain = (
    initial: readonly WakeEvent[],
  ): readonly ReconcileResult[] => {
    // MK-1: height-ordered, dirty-count-gated drain (replaces the arrival-order
    // FIFO queue). A recombinant (diamond) node with UNEQUAL path lengths fires
    // exactly ONCE per wave, against FULLY-SETTLED inputs — no glitch render, no
    // redundant render. `reconcile` (memo/skip, single-flight, commit, propagate)
    // is reused byte-for-byte; only the SCHEDULING of wakes changes (the seam
    // MK-1 lives in — the spec pins the per-node decision, never the drain order).
    const frontier = startFrontier(initial);
    const results: ReconcileResult[] = [];
    for (let node = frontier.next(); node !== null; node = frontier.next()) {
      let result: ReconcileResult | null = null;
      if (frontier.shouldFire(node)) {
        result = reconcile({ node, wake: frontier.wakeOf(node) });
        results.push(result);
      }
      frontier.commit(node, result);
    }
    frontier.finish();
    return results;
  };

  // -------------------------------------------------------------------------
  // The ASYNC path. The body mirrors the sync one except the render is `await`ed
  // — so the single-flight lock at (B)→(D) is released across the await, and a
  // wake landing mid-render from another async caller hits the (A) coalesce
  // guard for real.
  // -------------------------------------------------------------------------

  const reconcileAsync = async (
    event: WakeEvent,
  ): Promise<ReconcileResult> => {
    const { node, wake } = event;

    // --- (A) Single-flight + coalescing. Identical to the sync guard. Under the
    // async path this is REACHED: a second wake for this node, delivered while
    // the awaited render below is suspended, observes `inFlight === true`, marks
    // the node dirty + records the freshest wake, and returns `coalesced`
    // WITHOUT spawning a second concurrent render (05 §1.3). There is NO `await`
    // between this read and the lock-take at (B), so the check-and-set stays
    // atomic in single-threaded JS (05 §1.3 compare-and-set note).
    const state = flightFor(node);
    if (state.inFlight) {
      state.dirty = true;
      state.pendingWake = wake;
      return { node, disposition: "coalesced", propagated: [] };
    }

    const contractFp = contractFingerprintFor(topology, node);

    // --- Resolve the memo key's two halves (sync; world-model.md §4).
    const subscribedEdges = inboundEdges(topology.topology, node);
    const inputFingerprints = ports.resolveInputFingerprints(
      node,
      subscribedEdges,
    );
    const key = makeMemoKey(contractFp, inputFingerprints);

    // --- MEMO / SKIP. Pure-sync fingerprint comparison; no render spawned.
    // A prior FAILED receipt is NOT memoizable — the render committed nothing, so
    // a transient failure (e.g. a provider 402) must re-attempt on its next wake
    // rather than poison the node into a permanent skip (world-model.md §8).
    const last = ports.ledger.lastReceipt(node);
    if (last !== null && last.status !== "failed" && !memoKeyMoved(last, key)) {
      const skipped = buildSkippedReceipt({
        node,
        contractFp,
        wake,
        key,
        last,
        prev: ports.ledger.addressOf(last),
      });
      const ref = ports.ledger.append(skipped);
      return {
        node,
        disposition: "skipped",
        receipt: skipped,
        receipt_ref: ref,
        propagated: [],
      };
    }

    // --- (B) SCHEDULE: take the single-flight lock, AWAIT one render. The lock
    // is held across the suspension point so any concurrently-running
    // reconcileAsync for this node coalesces at (A) instead of double-rendering.
    state.inFlight = true;
    let result: ReconcileResult;
    try {
      result = await renderAndCommitAsync({
        ports,
        topology,
        node,
        contractFp,
        wake,
        key,
        last,
        subscribedEdges,
      });
    } finally {
      // --- (D) release the lock.
      state.inFlight = false;
    }

    // --- (E) Coalesced follow-up: a wake that landed DURING the awaited render
    // collapses into ONE follow-up render against the freshest inputs. The
    // follow-up re-runs the full memo/skip path (re-resolving input_fingerprints),
    // so an unmoved input simply skips — coalescing never forces a redundant
    // render. Recursion depth is bounded by the number of distinct wakes that
    // landed during renders (05 §1.3.4).
    if (state.dirty) {
      state.dirty = false;
      const followWake = state.pendingWake ?? wake;
      state.pendingWake = null;
      return await reconcileAsync({ node, wake: followWake });
    }

    return result;
  };

  const drainAsync = async (
    initial: readonly WakeEvent[],
  ): Promise<readonly ReconcileResult[]> => {
    // EXPERIMENT B (opt-in): with maxConcurrency > 1 the pooled loop below
    // renders simultaneously-ready nodes concurrently. The default (1) keeps
    // this serial loop byte-for-byte.
    if (maxConcurrency > 1) return drainPooledAsync(initial);
    // MK-1, async twin: the same height-ordered, dirty-count-gated frontier as the
    // sync `drain`, but each fire is `await`ed FULLY before its settle/propagate
    // bookkeeping is applied and the frontier re-evaluates `next()` — closing the
    // await-frontier gap (the height frontier must not advance until the awaited
    // render commits). Stays a serial pick-lowest-ready loop: NO node-level
    // parallelism (Change B is opt-in via `maxConcurrency`, default off).
    // `reconcileAsync` — including its per-node single-flight/coalesce guard —
    // is reused untouched; the drain serialization and that guard are
    // independent safety layers.
    const frontier = startFrontier(initial);
    const results: ReconcileResult[] = [];
    for (let node = frontier.next(); node !== null; node = frontier.next()) {
      let result: ReconcileResult | null = null;
      if (frontier.shouldFire(node)) {
        result = await reconcileAsync({ node, wake: frontier.wakeOf(node) });
        results.push(result);
      }
      frontier.commit(node, result);
    }
    frontier.finish();
    return results;
  };

  // EXPERIMENT B (spec 02 Part III §9, Change B): the node-level render worker
  // pool — `drainAsync` with `maxConcurrency > 1`. The SAME frontier as the
  // serial loops supplies ALL the safety: `next()` only returns nodes whose
  // dirty producers have all settled (the readiness gate IS the topological
  // ordering, so any set of simultaneously-ready nodes is mutually independent),
  // `begin()` keeps an in-flight node from being handed out twice, `commit()`
  // applies settle/propagate bookkeeping synchronously as each render lands
  // (the ledger/store commit seams are synchronous single-threaded JS — no
  // tearing), and the rank-guarded wake writer keeps join receipts identical to
  // a serial run. `reconcileAsync` — memo/skip, per-node single-flight,
  // dirty-coalescing — is reused untouched; a memo-skip inside the pool spawns
  // nothing and stays zero-token. Fail closed: a render returning
  // status:"failed" flows through the normal commit path (no propagation,
  // downstream prunes, prior truth stands); a THROWN reconcileAsync stops new
  // launches, awaits every in-flight render (no abandoned promises), then
  // rethrows — mirroring the serial loop's propagate-the-throw behavior.
  // Results arrive in COMPLETION order (documented on ReconcilerOptions).
  const drainPooledAsync = async (
    initial: readonly WakeEvent[],
  ): Promise<readonly ReconcileResult[]> => {
    const frontier = startFrontier(initial);
    const results: ReconcileResult[] = [];
    const inFlight = new Map<string, Promise<void>>();
    let errored = false;
    let firstError: unknown;

    const recordError = (error: unknown): void => {
      if (!errored) {
        errored = true;
        firstError = error;
      }
    };

    const launchReady = (): void => {
      while (!errored && inFlight.size < maxConcurrency) {
        const node = frontier.next();
        if (node === null) return;
        if (!frontier.shouldFire(node)) {
          // Prune-without-render, exactly as the serial loop: settle the
          // bookkeeping, never spawn, never write a receipt.
          frontier.commit(node, null);
          continue;
        }
        frontier.begin(node);
        const wake = frontier.wakeOf(node);
        // The chained promise ALWAYS fulfills (both branches handle their own
        // errors), so racing it never throws and nothing is left unhandled. The
        // self-delete from `inFlight` happens in the same tick as the
        // settle/commit, so the race loop never re-races a settled slot.
        const slot = reconcileAsync({ node, wake }).then(
          (result) => {
            inFlight.delete(node);
            try {
              results.push(result);
              frontier.commit(node, result);
            } catch (error) {
              // e.g. the non-dirty-closure propagation guard — fail closed.
              recordError(error);
            }
          },
          (error) => {
            inFlight.delete(node);
            recordError(error);
          },
        );
        inFlight.set(node, slot);
      }
    };

    launchReady();
    while (inFlight.size > 0) {
      await Promise.race(inFlight.values());
      launchReady();
    }
    if (errored) throw firstError;
    frontier.finish();
    return results;
  };

  return { reconcile, drain, reconcileAsync, drainAsync };
}

// ===========================================================================
// Render + commit + propagate
// ===========================================================================

function renderAndCommit(input: {
  ports: ReconcilerPorts;
  topology: ReconcilerTopology;
  node: string;
  contractFp: Fingerprint;
  wake: Wake;
  key: MemoKey;
  last: Receipt | null;
  /** The node's resolved inbound edges (producer + facet) — threaded to the render. */
  subscribedEdges: readonly TopologyEdge[];
}): ReconcileResult {
  const { ports, topology, node, contractFp, wake, key, last, subscribedEdges } =
    input;

  const prior = ports.worldModel.publishedRef(node);
  const prevRef = last !== null ? ports.ledger.addressOf(last) : null;

  // Spawn ONE render (the language layer). The reconciler stays dumb.
  const outcome = ports.spawnRender({
    node,
    contract_fingerprint: contractFp,
    wake,
    input_fingerprints: key.input_fingerprints,
    inbound_edges: subscribedEdges,
    prior_world_model: prior,
  });

  // --- FAILURE: a failed render (error or failed postcondition validator)
  // commits nothing; the prior world-model stands; a `failed` receipt is logged;
  // NO downstream wakes (the fingerprint didn't move) (architecture.md §4.1).
  if (outcome.status === "failed") {
    const failed = buildFailedReceipt({
      node,
      contractFp,
      wake,
      key,
      prev: prevRef,
      last,
      cost: outcome.cost,
    });
    const ref = ports.ledger.append(failed);
    return {
      node,
      disposition: "failed",
      receipt: failed,
      receipt_ref: ref,
      propagated: [],
    };
  }

  return commitRendered({
    ports,
    topology,
    node,
    contractFp,
    wake,
    key,
    last,
    prevRef,
    commit: outcome.commit,
    semantic_diff: outcome.semantic_diff,
    cost: outcome.cost,
  });
}

/**
 * The post-render commit + propagate tail, shared by `renderAndCommit` and
 * `renderAndCommitAsync` (pure-sync once the render outcome is resolved): the
 * render already persisted its published world-model to the store, so the
 * reconciler signs the `rendered` receipt, appends it to the node-scoped ledger,
 * and wakes downstreams subscribed to a MOVED facet. Only a moved fingerprint
 * propagates (world-model.md §8); cold start (no prior receipt) is a move for
 * every facet the node publishes.
 */
function commitRendered(input: {
  ports: ReconcilerPorts;
  topology: ReconcilerTopology;
  node: string;
  contractFp: Fingerprint;
  wake: Wake;
  key: MemoKey;
  last: Receipt | null;
  prevRef: ContentAddress | null;
  commit: WorldModelCommit;
  semantic_diff: SemanticDiff;
  cost: Cost;
}): ReconcileResult {
  const { ports, topology, node, contractFp, wake, key, last, prevRef } = input;

  const rendered = buildRenderedReceipt({
    node,
    contractFp,
    wake,
    key,
    fingerprints: input.commit.fingerprints,
    semantic_diff: input.semantic_diff,
    prev: prevRef,
    cost: input.cost,
  });
  const ref = ports.ledger.append(rendered);

  const movedFacets = movedFacetsBetween(
    last?.fingerprints ?? null,
    input.commit.fingerprints,
  );
  const propagated =
    movedFacets.size > 0
      ? propagationTargets({
          topology: topology.topology,
          producer: node,
          movedFacets,
          wakeRef: ref,
        })
      : [];

  return {
    node,
    disposition: "rendered",
    receipt: rendered,
    receipt_ref: ref,
    propagated,
  };
}

/**
 * The ASYNC sibling of `renderAndCommit`: identical commit / sign / propagate
 * machinery, but the render spawn is AWAITED. Prefers the async port
 * `spawnRenderAsync` (a real bounded LLM session); when absent, wraps the sync
 * `spawnRender` (a render is trivially an already-resolved promise), so the async
 * path subsumes the sync one without forcing every wiring to supply an async spawn.
 */
async function renderAndCommitAsync(input: {
  ports: ReconcilerPorts;
  topology: ReconcilerTopology;
  node: string;
  contractFp: Fingerprint;
  wake: Wake;
  key: MemoKey;
  last: Receipt | null;
  /** The node's resolved inbound edges (producer + facet) — threaded to the render. */
  subscribedEdges: readonly TopologyEdge[];
}): Promise<ReconcileResult> {
  const { ports, topology, node, contractFp, wake, key, last, subscribedEdges } =
    input;

  const prior = ports.worldModel.publishedRef(node);
  const prevRef = last !== null ? ports.ledger.addressOf(last) : null;

  // Spawn ONE render (the language layer), AWAITED. The reconciler stays dumb.
  const request: RenderRequest = {
    node,
    contract_fingerprint: contractFp,
    wake,
    input_fingerprints: key.input_fingerprints,
    inbound_edges: subscribedEdges,
    prior_world_model: prior,
  };
  const outcome =
    ports.spawnRenderAsync !== undefined
      ? await ports.spawnRenderAsync(request)
      : ports.spawnRender(request);

  // --- FAILURE: identical to the sync path. Commits nothing; prior truth stands.
  if (outcome.status === "failed") {
    const failed = buildFailedReceipt({
      node,
      contractFp,
      wake,
      key,
      prev: prevRef,
      last,
      cost: outcome.cost,
    });
    const ref = ports.ledger.append(failed);
    return {
      node,
      disposition: "failed",
      receipt: failed,
      receipt_ref: ref,
      propagated: [],
    };
  }

  // --- COMMIT + PROPAGATE: identical pure-sync machinery as the sync path.
  return commitRendered({
    ports,
    topology,
    node,
    contractFp,
    wake,
    key,
    last,
    prevRef,
    commit: outcome.commit,
    semantic_diff: outcome.semantic_diff,
    cost: outcome.cost,
  });
}

// ===========================================================================
// Memo-key comparison — the heart of the skip decision (React.memo-style)
// ===========================================================================

/**
 * Has the memo key moved since the node's last receipt? The key is EXACTLY
 * `(contract_fingerprint, input_fingerprints)` (world-model.md §4); nothing else
 * is admissible. Returns `true` iff either half differs — the React.memo
 * "props changed" test, applied to fingerprints of meaning.
 */
export function memoKeyMoved(
  last: Unbrand<Receipt>,
  key: Unbrand<MemoKey>,
): boolean {
  if (last.contract_fingerprint !== key.contract_fingerprint) {
    return true;
  }
  return !fingerprintTuplesEqual(
    last.input_fingerprints,
    key.input_fingerprints,
  );
}

function fingerprintTuplesEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

/**
 * The set of facets whose published fingerprint moved between the prior receipt
 * and this commit. A `null` prior (cold start) means every published facet
 * moved. Only these facets drive propagation (architecture.md §4.1).
 */
export function movedFacetsBetween(
  prior: FingerprintMap | null,
  next: FingerprintMap,
): ReadonlySet<Facet> {
  const moved = new Set<Facet>();
  for (const facet of Object.keys(next)) {
    const before = prior?.[facet];
    if (before === undefined || before !== next[facet]) {
      moved.add(asFacet(facet));
    }
  }
  return moved;
}

// ===========================================================================
// Propagation — resolve downstream wakes from the topology edges
// ===========================================================================

/**
 * The downstream wakes a moved producer facet triggers. Read the topology
 * world-model's edges (architecture.md §6.3): every `subscriber` whose edge
 * points at this `producer` on a moved `facet` is woken with an `input` wake
 * referencing the producing receipt. A facet that moved but has no subscriber
 * simply propagates to nothing. A subscriber is woken at most once even if it
 * subscribes to several moved facets of the same producer.
 */
export function propagationTargets(input: {
  topology: TopologyWorldModel;
  producer: string;
  movedFacets: ReadonlySet<Facet>;
  wakeRef: ContentAddress;
}): readonly WakeEvent[] {
  const { topology, producer, movedFacets, wakeRef } = input;
  const woken = new Set<string>();
  const targets: WakeEvent[] = [];
  for (const edge of topology.edges) {
    if (edge.producer !== producer) {
      continue;
    }
    if (!movedFacets.has(edge.facet)) {
      continue;
    }
    if (woken.has(edge.subscriber)) {
      continue;
    }
    woken.add(edge.subscriber);
    targets.push({
      node: edge.subscriber,
      wake: { source: "input", refs: [wakeRef] },
    });
  }
  return targets;
}

/** The edges whose `subscriber` is this node — the node's resolved subscriptions. */
export function inboundEdges(
  topology: TopologyWorldModel,
  node: string,
): readonly TopologyEdge[] {
  return topology.edges.filter((edge) => edge.subscriber === node);
}

// ===========================================================================
// Receipt builders — rendered / skipped / failed (SHAPES.md §4)
// ===========================================================================

function nullSig(): ReceiptSignature {
  return createNullSignature();
}

function buildRenderedReceipt(input: {
  node: string;
  contractFp: Fingerprint;
  wake: Wake;
  key: MemoKey;
  fingerprints: FingerprintMap;
  semantic_diff: SemanticDiff;
  prev: ContentAddress | null;
  cost: Cost;
}): Receipt {
  return {
    node: asNodeId(input.node),
    contract_fingerprint: input.contractFp,
    wake: input.wake,
    input_fingerprints: input.key.input_fingerprints,
    fingerprints: input.fingerprints,
    semantic_diff: input.semantic_diff,
    prev: input.prev,
    status: "rendered" satisfies ReceiptStatus,
    cost: input.cost,
    sig: nullSig(),
  };
}

/**
 * A `skipped` receipt copies the unchanged `fingerprints` forward, carries
 * `EMPTY_SEMANTIC_DIFF`, and zero `cost` (architecture.md §8 dirty/coalesce;
 * SHAPES.md §4). It records that the wake was handled cheaply — no render. Its
 * `prev` chains to the last receipt (the content address the ledger handed back
 * when that receipt was appended), keeping the node-scoped ledger a single
 * chain through skips.
 */
function buildSkippedReceipt(input: {
  node: string;
  contractFp: Fingerprint;
  wake: Wake;
  key: MemoKey;
  last: Receipt;
  prev: ContentAddress | null;
}): Receipt {
  return {
    node: asNodeId(input.node),
    contract_fingerprint: input.contractFp,
    wake: input.wake,
    input_fingerprints: input.key.input_fingerprints,
    fingerprints: input.last.fingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: input.prev ?? null,
    status: "skipped" satisfies ReceiptStatus,
    cost: zeroCost(input.wake.source),
    sig: nullSig(),
  };
}

/**
 * A `failed` receipt commits nothing: it copies the prior `fingerprints`
 * forward (the prior truth stands), carries the empty diff, and the observed
 * cost. It does NOT propagate (architecture.md §4.1).
 */
function buildFailedReceipt(input: {
  node: string;
  contractFp: Fingerprint;
  wake: Wake;
  key: MemoKey;
  prev: ContentAddress | null;
  last: Receipt | null;
  cost: Cost;
}): Receipt {
  const priorFingerprints: FingerprintMap =
    input.last?.fingerprints ?? coldStartFingerprints();
  return {
    node: asNodeId(input.node),
    contract_fingerprint: input.contractFp,
    wake: input.wake,
    input_fingerprints: input.key.input_fingerprints,
    fingerprints: priorFingerprints,
    semantic_diff: EMPTY_SEMANTIC_DIFF,
    prev: input.prev,
    status: "failed" satisfies ReceiptStatus,
    cost: input.cost,
    sig: nullSig(),
  };
}

/** Zero cost for a skip — no fresh or reused tokens were spent. */
function zeroCost(surprise_cause: WakeSource): Cost {
  return {
    provider: "none",
    model: "none",
    tokens: { fresh: 0, reused: 0 },
    surprise_cause,
  };
}

/**
 * The cold-start published fingerprints for a node that has never rendered: a
 * singleton atomic map (architecture.md §8 gateway cold-start: "a defined
 * initial (empty) world-model with an initial fingerprint"). Used only when a
 * failed render has no prior receipt to copy from.
 */
function coldStartFingerprints(): FingerprintMap {
  return { [ATOMIC_FACET]: COLD_START_ATOMIC_FINGERPRINT };
}

/** The reserved fingerprint of the empty "no data yet" world-model (§8). */
export const COLD_START_ATOMIC_FINGERPRINT = asFingerprint("cold-start:empty");

// ===========================================================================
// Topology helpers
// ===========================================================================

function contractFingerprintFor(
  topology: ReconcilerTopology,
  node: string,
): Fingerprint {
  const fp = topology.contract_fingerprints[node];
  if (fp === undefined) {
    throw new Error(
      `reactor: node "${node}" has no compiled contract fingerprint; ` +
        "the topology world-model must be produced by Forme before reconcile " +
        "(architecture.md §2: topology is a fixed input per scheduling epoch).",
    );
  }
  return fp;
}
