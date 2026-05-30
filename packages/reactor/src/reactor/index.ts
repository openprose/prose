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
  type Wake,
  type WakeSource,
  type WorldModelCommit,
  type WorldModelRef,
  ATOMIC_FACET,
  EMPTY_SEMANTIC_DIFF,
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

// ===========================================================================
// Reconciler configuration + result types
// ===========================================================================

export interface ReconcilerPorts {
  readonly ledger: ReceiptLedgerPort;
  readonly worldModel: WorldModelStorePort;
  readonly spawnRender: SpawnRender;
  readonly resolveInputFingerprints: ResolveInputFingerprints;
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
}

/**
 * Construct the dumb reconciler over injected ports + a fixed compiled
 * topology. No judge, no policy, no backstop — the entire decision is
 * fingerprint comparison (delta.md §A0; architecture.md §4.1).
 */
export function createReconciler(
  ports: ReconcilerPorts,
  topology: ReconcilerTopology,
): ReconcilerHandle {
  const flight = new Map<string, NodeFlightState>();

  const flightFor = (node: string): NodeFlightState => {
    let state = flight.get(node);
    if (state === undefined) {
      state = { inFlight: false, dirty: false, pendingWake: null };
      flight.set(node, state);
    }
    return state;
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
    if (last !== null && !memoKeyMoved(last, key)) {
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
    const results: ReconcileResult[] = [];
    const queue: WakeEvent[] = [...initial];
    while (queue.length > 0) {
      const event = queue.shift() as WakeEvent;
      const result = reconcile(event);
      results.push(result);
      // Propagation: only `rendered`-with-a-moved-fingerprint enqueues
      // downstreams (architecture.md §4.1; world-model.md §8).
      for (const downstream of result.propagated) {
        queue.push(downstream);
      }
    }
    return results;
  };

  return { reconcile, drain };
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
}): ReconcileResult {
  const { ports, topology, node, contractFp, wake, key, last } = input;

  const prior = ports.worldModel.publishedRef(node);
  const prevRef = last !== null ? ports.ledger.addressOf(last) : null;

  // Spawn ONE render (the language layer). The reconciler stays dumb.
  const outcome = ports.spawnRender({
    node,
    contract_fingerprint: contractFp,
    wake,
    input_fingerprints: key.input_fingerprints,
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

  // --- COMMIT: the render already persisted its published world-model to the
  // store (returning the WorldModelCommit: version + fingerprints); the
  // reconciler signs the receipt and appends it to the node-scoped ledger
  // (architecture.md §4.1, §5.1).
  const rendered = buildRenderedReceipt({
    node,
    contractFp,
    wake,
    key,
    fingerprints: outcome.commit.fingerprints,
    semantic_diff: outcome.semantic_diff,
    prev: prevRef,
    cost: outcome.cost,
  });
  const ref = ports.ledger.append(rendered);

  // --- PROPAGATE: wake downstreams subscribed to a MOVED facet. Only a moved
  // fingerprint propagates (world-model.md §8: "Only `rendered` with a moved
  // fingerprint propagates"). Cold start (no prior receipt) is a move for every
  // facet the node publishes.
  const movedFacets = movedFacetsBetween(
    last?.fingerprints ?? null,
    outcome.commit.fingerprints,
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

// ===========================================================================
// Memo-key comparison — the heart of the skip decision (React.memo-style)
// ===========================================================================

/**
 * Has the memo key moved since the node's last receipt? The key is EXACTLY
 * `(contract_fingerprint, input_fingerprints)` (world-model.md §4); nothing else
 * is admissible. Returns `true` iff either half differs — the React.memo
 * "props changed" test, applied to fingerprints of meaning.
 */
export function memoKeyMoved(last: Receipt, key: MemoKey): boolean {
  if (last.contract_fingerprint !== key.contract_fingerprint) {
    return true;
  }
  return !fingerprintTuplesEqual(
    last.input_fingerprints,
    key.input_fingerprints,
  );
}

function fingerprintTuplesEqual(
  left: InputFingerprints,
  right: InputFingerprints,
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
      moved.add(facet);
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
    node: input.node,
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
    node: input.node,
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
    node: input.node,
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
export const COLD_START_ATOMIC_FINGERPRINT = "cold-start:empty" as const;

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
