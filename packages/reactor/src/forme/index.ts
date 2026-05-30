// Forme — the DAG-level wiring as an SDK runtime artifact.
//
// Forme is the compile-phase render that "draws the DAG from contracts"
// (architecture.md §3.1): it reads all declared contracts, semantically matches
// `Requires.<facet> ↔ Maintains.<facet>` across mounted responsibilities, draws
// the subscription edges, registers external-driven entry points, and enforces
// acyclicity as a postcondition on its own `### Maintains` (plan.md §5).
//
// Its output is the TOPOLOGY WORLD-MODEL (architecture.md §6.3) — a maintained
// truth like any other: `nodes` / `edges` / `entry_points` / `acyclic`. The
// reconciler reads `edges` to resolve propagation targets (architecture.md
// §4.1). This module is the SDK runtime; the SKILL `forme.md` doc owns the
// natural-language compile contract.
//
// Two load-bearing model decisions, taken straight from the spec:
//
//   1. NODE-NESS IS ADDITIVE — it comes from MOUNTING, not statefulness
//      (plan.md §2). A `RenderContract` is just a declaration + render. Mounting
//      ADDS identity + a persisted world-model + resolved subscriptions, turning
//      it into a `MountedNode`. The render atom runs standalone (unmounted) or
//      mounted; mounting never rewrites the contract, it only wraps it.
//
//   2. FORME INFERS THE WIRING; THE AUTHOR DECLARES THE WAKE-SOURCE
//      (plan.md §5). Forme only *infers* the input-driven edges (by matching
//      facet contracts); it *reads* declared `### Continuity` to register entry
//      points. It never guesses a cadence or a trigger.
//
// The semantic Requires↔Maintains match is the one intelligent step
// (architecture.md §3.1: "string-matching would defeat the point of a smart
// layer"). In this SDK runtime the matcher is an INJECTED pure function
// (`FacetMatcher`) — the compile-phase intelligence lives behind the injection
// boundary (architecture.md §5.3), while the deterministic scaffolding (slot
// assignment, conflict diagnostics, entry-point registration, acyclicity) lives
// here. A default exact-name matcher is provided for tests and the degenerate
// already-canonicalized case.

import {
  ATOMIC_FACET,
  type Facet,
  type Fingerprint,
  type TopologyEdge,
  type TopologyNode,
  type TopologyWorldModel,
  type WakeSource,
} from "../shapes";
import {
  detectReceiptCycles,
  type ConsumedReceiptEdge,
  type ContentAddressV0,
} from "../cycle";

// ---------------------------------------------------------------------------
// Contracts: the render atom and the wake-source declaration
// ---------------------------------------------------------------------------

/**
 * A facet contract a node `### Requires` — a named input need that Forme matches
 * against some producer's `### Maintains` facet (plan.md §4, §5). `facet` is the
 * facet-contract name the author wrote; `fanIn` opts the need into deliberate
 * fan-in (one need, many producers — "all sources of competitor funding"),
 * where each matched producer becomes a distinct slot (architecture.md §3.1,
 * plan.md §5 "the diamond rule").
 */
export interface RequiresContract {
  readonly facet: Facet;
  /** Allow more than one producer to satisfy this need (fan-in). Default false. */
  readonly fanIn?: boolean;
}

/**
 * A facet a node `### Maintains` — a named part of its published truth that
 * downstreams may subscribe to (plan.md §4). A producer that declares no facets
 * exposes its atomic world-model as the single implicit facet `ATOMIC_FACET`
 * (architecture.md §3.1).
 */
export type MaintainsContract = Facet;

/**
 * The render atom (plan.md §1): a declaration + a render. Every `kind` is sugar
 * over this one atom. A render contract is NOT yet a node — it becomes one only
 * when mounted (plan.md §2). This is the standalone unit: it carries its own
 * `### Continuity` wake-source intrinsically (it travels with the contract, not
 * the mount).
 */
export interface RenderContract {
  /** Stable identity of the declared contract (the future node id). */
  readonly id: string;
  /** Contract fingerprint, frozen at compile (architecture.md §6.3). */
  readonly contract_fingerprint: Fingerprint;
  /**
   * The kind sugar over the atom (plan.md §3). `function` / `pattern` / `test`
   * are NOT data-flow nodes — they never mount into the topology. `gateway` is
   * sugar for an external-driven `responsibility`.
   */
  readonly kind: RenderKind;
  /** `### Requires` facet contracts — Forme's match input. Empty for gateways. */
  readonly requires: readonly RequiresContract[];
  /**
   * `### Maintains` facets — the producer side of the match. An empty list means
   * the node exposes only its atomic whole-truth facet (architecture.md §3.1).
   */
  readonly maintains: readonly MaintainsContract[];
  /**
   * The node's intrinsic wake-source declaration (`### Continuity`, plan.md §4).
   * `input` is the default (falls out of `### Requires`); `self` is a declared
   * cadence; `external` is a declared outside trigger (the gateway case).
   */
  readonly wakeSource: WakeSource;
}

/**
 * The kinds (plan.md §3). Only `responsibility` and `gateway` are data-flow
 * nodes that mount into the DAG; `function` / `pattern` / `test` never do.
 * There is no `system` kind — it was deleted (plan.md §3).
 */
export type RenderKind =
  | "responsibility"
  | "gateway"
  | "function"
  | "pattern"
  | "test";

const DATA_FLOW_KINDS: ReadonlySet<RenderKind> = new Set([
  "responsibility",
  "gateway",
]);

/**
 * Is this contract a data-flow node — i.e. does mounting it produce a
 * subscribable, persisted world-model (plan.md §2: "does it produce a
 * subscribable, persisted world-model? *This* is the 'is it in the graph?'
 * line")? `function` / `pattern` / `test` are not.
 */
export function isDataFlowKind(kind: RenderKind): boolean {
  return DATA_FLOW_KINDS.has(kind);
}

// ---------------------------------------------------------------------------
// Mounting makes a node — node-ness is ADDITIVE (plan.md §2)
// ---------------------------------------------------------------------------

/**
 * A mounted node (plan.md §2). Mounting is a USAGE, not a type: it wraps a
 * `RenderContract` and ADDS the runtime identity + the resolved subscriptions
 * Forme wires. The contract underneath is untouched — the same render atom runs
 * standalone (unmounted) or mounted. `subscriptions` is populated by `wire(...)`
 * once Forme resolves the edges; at mount time it is empty.
 */
export interface MountedNode {
  /** The wrapped render contract (node-ness is additive over it). */
  readonly contract: RenderContract;
  /** Runtime node identity (defaults to the contract id). */
  readonly node: string;
  /**
   * The resolved input subscriptions, one slot per matched producer/facet in
   * resolved order (the memo key's second-half order, SHAPES §3). Empty until
   * `wire(...)` resolves the topology.
   */
  readonly subscriptions: readonly ResolvedSubscription[];
}

/**
 * A single resolved input subscription slot: which producer/facet this node
 * consumes. The ORDER of a mounted node's `subscriptions` is the resolved
 * subscription order — it pins the `input_fingerprints` tuple order (SHAPES §3,
 * architecture.md §6.1).
 */
export interface ResolvedSubscription {
  readonly producer: string;
  readonly facet: Facet;
}

/**
 * Mount a render contract — confer node-ness (plan.md §2). Additive: it does not
 * mutate the contract, it wraps it with identity and (initially empty)
 * subscriptions. Only data-flow kinds (`responsibility` / `gateway`) are
 * mountable into the DAG; mounting a `function` is a usage error because a
 * function is a called render with no world-model (plan.md §3).
 */
export function mountNode(contract: RenderContract): MountedNode {
  if (!isDataFlowKind(contract.kind)) {
    throw new Error(
      `forme: cannot mount a '${contract.kind}' contract '${contract.id}' as a node — ` +
        `only 'responsibility' and 'gateway' produce a subscribable world-model (plan.md §2/§3)`,
    );
  }
  return {
    contract,
    node: contract.id,
    subscriptions: [],
  };
}

// ---------------------------------------------------------------------------
// The semantic matcher — the one intelligent step, behind the injection seam
// ---------------------------------------------------------------------------

/**
 * The semantic facet matcher (architecture.md §3.1). Given a subscriber's
 * `### Requires` facet contract and a candidate producer facet, decide whether
 * the producer SEMANTICALLY satisfies the need. Injected so the compile-phase
 * intelligence lives behind the adapter boundary (architecture.md §5.3); the
 * deterministic scaffolding around it lives in this module.
 */
export type FacetMatcher = (
  requirement: FacetRequirement,
  candidate: FacetCandidate,
) => boolean;

export interface FacetRequirement {
  readonly subscriber: string;
  readonly facet: Facet;
}

export interface FacetCandidate {
  readonly producer: string;
  readonly facet: Facet;
}

/**
 * The default deterministic matcher: exact facet-name equality. This is the
 * degenerate already-canonicalized case and the test default — NOT the
 * production semantic match (architecture.md §3.1 warns "string-matching would
 * defeat the point of a smart layer"); production injects a model-backed
 * `FacetMatcher`.
 */
export const exactFacetMatcher: FacetMatcher = (requirement, candidate) =>
  requirement.facet === candidate.facet;

// ---------------------------------------------------------------------------
// Wiring diagnostics — never a silent guess (architecture.md §3.1)
// ---------------------------------------------------------------------------

/**
 * A surfaced wiring diagnostic (architecture.md §3.1, plan.md §5). A need with
 * no satisfying producer (`unsatisfied`) or two equally-plausible producers
 * without declared fan-in (`ambiguous`) is surfaced, never silently guessed.
 */
export interface WiringDiagnostic {
  readonly kind: "unsatisfied" | "ambiguous";
  readonly subscriber: string;
  readonly facet: Facet;
  /** Candidate producers found (empty for `unsatisfied`, ≥2 for `ambiguous`). */
  readonly candidates: readonly string[];
  readonly message: string;
}

/** The exposed facets of a node — the declared list, or the implicit atomic facet. */
export function exposedFacets(contract: RenderContract): readonly Facet[] {
  return contract.maintains.length > 0
    ? contract.maintains
    : [ATOMIC_FACET];
}

// ---------------------------------------------------------------------------
// wire(...) — the Forme render: contracts → topology world-model
// ---------------------------------------------------------------------------

export interface WireOptions {
  /** The semantic matcher; defaults to exact-name equality (test default). */
  readonly matcher?: FacetMatcher;
}

/**
 * The full output of a Forme render: the topology world-model (architecture.md
 * §6.3), the per-subscriber resolved subscriptions (the mount-time wiring), and
 * any surfaced wiring diagnostics. `acyclic` is computed by reusing
 * `detectReceiptCycles` as the acyclicity postcondition (architecture.md §3.1).
 */
export interface FormeResult {
  readonly topology: TopologyWorldModel;
  /** node id → its resolved subscriptions, in tuple order (SHAPES §3). */
  readonly subscriptionsByNode: ReadonlyMap<string, readonly ResolvedSubscription[]>;
  readonly diagnostics: readonly WiringDiagnostic[];
}

/**
 * Run Forme over a set of declared contracts and produce the topology
 * world-model (architecture.md §3.1, §6.3; plan.md §5).
 *
 * Steps, in order:
 *  1. Mount the data-flow contracts (responsibility / gateway) as nodes; non
 *     data-flow kinds (function / pattern / test) never enter the DAG (plan.md
 *     §2/§3).
 *  2. For each subscriber `### Requires` facet, match against every producer
 *     facet via the injected matcher; resolve to edges. No producer ⇒
 *     `unsatisfied`; ≥2 producers without `fanIn` ⇒ `ambiguous` (diagnostics,
 *     never a silent guess). With `fanIn`, every match becomes a distinct slot
 *     (the diamond rule, plan.md §5).
 *  3. Register entry points: nodes whose `### Continuity` is external-driven
 *     (the gateways) — Forme reads the declared wake-source, never guesses
 *     (plan.md §5).
 *  4. Enforce acyclicity as a postcondition by reusing `detectReceiptCycles`
 *     over the resolved edges (architecture.md §3.1). Genuine feedback is
 *     self-driven continuity, not a back-edge — it never appears as an edge.
 */
export function wire(
  contracts: readonly RenderContract[],
  options: WireOptions = {},
): FormeResult {
  const matcher = options.matcher ?? exactFacetMatcher;

  // 1. Mount data-flow contracts; sort by id for deterministic output.
  const dataFlow = contracts
    .filter((c) => isDataFlowKind(c.kind))
    .slice()
    .sort((a, b) => compareString(a.id, b.id));

  assertUniqueIds(dataFlow);

  const nodes: TopologyNode[] = dataFlow.map((c) => ({
    node: c.id,
    contract_fingerprint: c.contract_fingerprint,
    wake_source: c.wakeSource,
  }));

  // Producer index: every exposed facet of every data-flow node.
  const candidates: FacetCandidate[] = [];
  for (const c of dataFlow) {
    for (const facet of exposedFacets(c)) {
      candidates.push({ producer: c.id, facet });
    }
  }

  // 2. Resolve subscriptions per subscriber, in declared `### Requires` order so
  // the slot tuple is stable (SHAPES §3: "the resolved subscription order").
  const edges: TopologyEdge[] = [];
  const diagnostics: WiringDiagnostic[] = [];
  const subscriptionsByNode = new Map<string, ResolvedSubscription[]>();

  for (const c of dataFlow) {
    const subscriptions: ResolvedSubscription[] = [];

    for (const need of c.requires) {
      const requirement: FacetRequirement = {
        subscriber: c.id,
        facet: need.facet,
      };

      // Candidates from OTHER nodes (a node never subscribes to its own facet —
      // legitimate feedback is self-driven continuity, plan.md §5, not an edge).
      const matched = candidates
        .filter(
          (cand) =>
            cand.producer !== c.id && matcher(requirement, cand),
        )
        .sort(compareCandidate);

      if (matched.length === 0) {
        diagnostics.push({
          kind: "unsatisfied",
          subscriber: c.id,
          facet: need.facet,
          candidates: [],
          message:
            `forme: '${c.id}' requires '${need.facet}' but no node maintains a ` +
            `satisfying facet (architecture.md §3.1: surfaced, never a silent guess)`,
        });
        continue;
      }

      if (matched.length > 1 && need.fanIn !== true) {
        diagnostics.push({
          kind: "ambiguous",
          subscriber: c.id,
          facet: need.facet,
          candidates: matched.map((m) => m.producer),
          message:
            `forme: '${c.id}' requires '${need.facet}' but ${matched.length} producers ` +
            `match without declared fan-in (architecture.md §3.1: ambiguous match is a diagnostic)`,
        });
        continue;
      }

      // Wire one slot per matched producer (fan-in adds slots — the diamond
      // rule, plan.md §5). With no fan-in there is exactly one match here.
      for (const cand of matched) {
        edges.push({
          subscriber: c.id,
          producer: cand.producer,
          facet: cand.facet,
        });
        subscriptions.push({ producer: cand.producer, facet: cand.facet });
      }
    }

    subscriptionsByNode.set(c.id, subscriptions);
  }

  // 3. Entry points: external-driven nodes (gateways). Forme reads the declared
  // `### Continuity`; it never infers a trigger (plan.md §5).
  const entry_points = dataFlow
    .filter((c) => c.wakeSource === "external")
    .map((c) => c.id)
    .sort(compareString);

  // 4. Acyclicity postcondition — reuse detectReceiptCycles over node-level
  // edges encoded as content addresses (architecture.md §3.1). The DFS rejects
  // graph cycles only; self-driven feedback never produces an edge here.
  const acyclic = !hasNodeCycle(edges);

  const topology: TopologyWorldModel = {
    nodes,
    edges: edges.slice().sort(compareEdge),
    entry_points,
    acyclic,
  };

  return {
    topology,
    subscriptionsByNode,
    diagnostics,
  };
}

/**
 * Apply a Forme result onto already-mounted nodes — populate each node's
 * additive `subscriptions` from the resolved topology (plan.md §2: mounting ADDS
 * the resolved subscriptions). Returns new `MountedNode`s; never mutates.
 */
export function applyWiring(
  mounted: readonly MountedNode[],
  result: FormeResult,
): readonly MountedNode[] {
  return mounted.map((m) => ({
    ...m,
    subscriptions: result.subscriptionsByNode.get(m.node) ?? [],
  }));
}

// ---------------------------------------------------------------------------
// Acyclicity — reuse detectReceiptCycles (the kept kernel half), per §3.1
// ---------------------------------------------------------------------------

/**
 * Run the acyclicity postcondition over node-level subscription edges by
 * encoding each node id as a stable content address and reusing the kept
 * `detectReceiptCycles` DFS (architecture.md §3.1; SHAPES §8). An edge
 * subscriber→producer means "subscriber consumes producer"; a cycle in that
 * relation would close a non-terminating loop and is rejected.
 */
export function hasNodeCycle(edges: readonly TopologyEdge[]): boolean {
  const receiptEdges: ConsumedReceiptEdge[] = edges.map((e) => ({
    from: nodeAddress(e.subscriber),
    to: nodeAddress(e.producer),
  }));
  return detectReceiptCycles(receiptEdges).has_cycle;
}

/**
 * Encode a node id as a deterministic `sha256:<64 hex>` content address so it
 * satisfies `detectReceiptCycles`'s edge-address contract. Pure, total, and
 * collision-free for distinct ids (a hex-encoded, zero-padded digest of the
 * id's char codes — sufficient as a stable injective key for the DFS; it is NOT
 * a cryptographic fingerprint and is never persisted).
 */
function nodeAddress(id: string): ContentAddressV0 {
  // FNV-1a-style rolling mix into a wide hex string keyed by id, then expand to
  // 64 hex chars by repeating a per-id deterministic stream. Distinct ids yield
  // distinct strings because the id is length-prefixed and fully folded in.
  let hex = "";
  let h = 0x811c9dc5;
  const seed = `${id.length}:${id}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
    hex += (h >>> 24).toString(16).padStart(2, "0");
  }
  // Mix the full id once more into the tail to keep collisions away for ids that
  // share a digest prefix, then normalize to exactly 64 lowercase hex chars.
  for (let i = 0; hex.length < 64; i++) {
    h = Math.imul(h ^ (seed.charCodeAt(i % seed.length) + i), 0x01000193) >>> 0;
    hex += (h >>> 16).toString(16).padStart(2, "0");
  }
  return `sha256:${hex.slice(0, 64).toLowerCase()}` as ContentAddressV0;
}

// ---------------------------------------------------------------------------
// Deterministic comparators (stable topology output)
// ---------------------------------------------------------------------------

function compareString(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareCandidate(a: FacetCandidate, b: FacetCandidate): number {
  const byProducer = compareString(a.producer, b.producer);
  return byProducer !== 0 ? byProducer : compareString(a.facet, b.facet);
}

function compareEdge(a: TopologyEdge, b: TopologyEdge): number {
  const bySub = compareString(a.subscriber, b.subscriber);
  if (bySub !== 0) return bySub;
  const byProd = compareString(a.producer, b.producer);
  if (byProd !== 0) return byProd;
  return compareString(a.facet, b.facet);
}

function assertUniqueIds(contracts: readonly RenderContract[]): void {
  const seen = new Set<string>();
  for (const c of contracts) {
    if (seen.has(c.id)) {
      throw new Error(
        `forme: duplicate node id '${c.id}' — each mounted contract must have a unique identity`,
      );
    }
    seen.add(c.id);
  }
}
