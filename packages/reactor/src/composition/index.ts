// Composition — subscription (props) + cross-node read-isolation (pins).
//
// The reconciler/topology world-model recasts composition exactly as a React
// component tree: a node's subscriptions ARE its props, and the resolved DAG IS
// the component tree (delta.md §A "subscriptions = props; DAG = component tree").
// This module owns the two structural primitives that fall out of that model:
//
//   1. The read-isolation pin (architecture.md §8 "Cross-node read isolation"):
//      a render pins a content-addressed snapshot of each input world-model — by
//      `version` (content address) plus the per-facet `fingerprint` it consumed
//      — at render start, so a concurrent upstream commit cannot cause a torn
//      read. The pin is re-homed against `ContentAddress` + `Fingerprint`
//      (SHAPES §7; delta.md §A3.4), keeping the upstream version identifier (the
//      second life of the old `contract_revision`, delta.md §A6).
//
//   2. Propagation-by-topology-edge (architecture.md §4.1, §6.3): on a
//      `rendered` receipt whose fingerprint moved, wake the downstreams
//      subscribed to the moved facet(s) by reading the topology world-model's
//      `edges`. The old memoized-*verdict* coupling (CompositionMemoStoreV0) is
//      gone — there is no judge, and the skip decision is the reconciler
//      comparing fingerprints (world-model.md §4, §8; delta.md §A3.4).
//
// This module imports ONLY the shared shapes (`../shapes`) and the kept cycle
// engine (`../cycle`). It does not import the retired spine (policy/judge) nor
// the old receipt envelope; everything is reshaped to the ideal Receipt/MemoKey.

import {
  ATOMIC_FACET,
  type ContentAddress,
  type Facet,
  type Fingerprint,
  type FingerprintMap,
  type InputFingerprints,
  type MemoKey,
  type Receipt,
  type TopologyEdge,
  type TopologyWorldModel,
  type WorldModelRef,
  makeMemoKey,
} from "../shapes";

const CONTENT_ADDRESS_PATTERN = /^sha256:[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// 1. The read-isolation pin (architecture.md §8; SHAPES §7; delta.md §A3.4)
// ---------------------------------------------------------------------------

/**
 * A content-addressed snapshot of one input world-model facet, pinned at render
 * start. The pin is the cross-node read-isolation primitive: it captures
 * `version` (the upstream published artifact's content address) and the
 * `fingerprint` of the exact facet the subscriber consumed, so a concurrent
 * upstream commit cannot cause a torn read (architecture.md §8). The `producer`
 * and `facet` identify which edge this pin satisfies (topology §6.3).
 */
export interface ConsumedReceiptPin {
  /** The producer node whose published world-model this pins. */
  readonly producer: string;
  /** The facet of the producer's `### Maintains` this subscriber consumed. */
  readonly facet: Facet;
  /** The content address of the pinned upstream published artifact (its version). */
  readonly version: ContentAddress;
  /** The producer's fingerprint for `facet` at pin time — the consumed token. */
  readonly fingerprint: Fingerprint;
}

/** Input to pin one input world-model from the producer's latest receipt. */
export interface PinInputV {
  /** The producer node. */
  readonly producer: string;
  /** The facet the subscriber depends on (ATOMIC_FACET if the producer declares none). */
  readonly facet: Facet;
  /** The producer's published world-model reference (carries `version`). */
  readonly world_model: WorldModelRef;
  /** The producer's latest receipt fingerprints (the published `{facet → token}` map). */
  readonly fingerprints: FingerprintMap;
}

/**
 * Pin a content-addressed snapshot of one input world-model facet at render
 * start. Resolves the facet token from the producer's published `fingerprints`
 * (falling back to `ATOMIC_FACET` when the producer declares no facets,
 * world-model.md §5: "its atomic world-model IS the single implicit facet").
 * Rejects a `workspace` ref or a cold-start `null` version — only the published,
 * fingerprinted artifact is subscribable (SHAPES §5; world-model.md §1).
 */
export function pinConsumedWorldModel(input: PinInputV): ConsumedReceiptPin {
  assertNonEmptyString(input.producer, "producer");
  const facet = normalizeFacet(input.facet);
  assertWorldModelRef(input.world_model, "world_model");

  if (input.world_model.node !== input.producer) {
    throw new Error("world_model.node must match producer");
  }
  if (input.world_model.workspace !== "published") {
    throw new Error("only a published world-model is subscribable (workspace is never pinned)");
  }
  const version = input.world_model.version;
  if (version === null) {
    throw new Error("cannot pin a cold-start world-model with no committed version");
  }
  assertContentAddress(version, "world_model.version");

  const fingerprint = resolveFacetFingerprint(input.fingerprints, facet);

  return { producer: input.producer, facet, version, fingerprint };
}

/**
 * Resolve a producer's token for a facet from its published fingerprint map. A
 * declared facet uses its own key; an undeclared facet resolves through the
 * reserved `ATOMIC_FACET` whole-truth token (world-model.md §5). The atomic
 * token must always be present (SHAPES §1).
 */
export function resolveFacetFingerprint(
  fingerprints: FingerprintMap,
  facet: Facet,
): Fingerprint {
  assertFingerprintMap(fingerprints, "fingerprints");

  const declared = fingerprints[facet];
  if (declared !== undefined) {
    return declared;
  }

  const atomic = fingerprints[ATOMIC_FACET];
  if (atomic === undefined) {
    throw new Error(`fingerprints is missing the reserved ${ATOMIC_FACET} token`);
  }
  return atomic;
}

// ---------------------------------------------------------------------------
// 2. Transitive freshness — recast as fingerprint-equality of the pins
//    (architecture.md §8; delta.md §A3.4; world-model.md §5)
// ---------------------------------------------------------------------------

export type PinFreshnessOutcome = "fresh" | "moved";

export interface PinFreshnessEvaluation {
  readonly producer: string;
  readonly facet: Facet;
  readonly pinned_fingerprint: Fingerprint;
  readonly current_fingerprint: Fingerprint;
  readonly outcome: PinFreshnessOutcome;
}

export interface ConsumedFreshnessInputV {
  readonly pin: ConsumedReceiptPin;
  /** The producer's CURRENT published fingerprints (its latest receipt). */
  readonly current_fingerprints: FingerprintMap;
}

export interface TransitiveFreshnessInputV {
  readonly consumed: readonly ConsumedFreshnessInputV[];
}

export interface TransitiveFreshnessResultV {
  /** `fresh` iff every pin's facet token still equals the producer's current token. */
  readonly outcome: PinFreshnessOutcome;
  readonly evaluations: readonly PinFreshnessEvaluation[];
  /** The pins whose facet fingerprint moved (the subscriber must re-render). */
  readonly moved: readonly ConsumedReceiptPin[];
}

/**
 * Evaluate whether the inputs a render pinned are still current. Recast of the
 * old transitive-freshness check: a pin is *fresh* iff the producer's current
 * facet token equals the pinned one, and *moved* otherwise — "B is woken by a
 * new receipt from A whose fingerprint for that facet differs from the one B
 * last consumed" (world-model.md §5). There is no clock, no policy, no judge;
 * staleness is pure fingerprint comparison (world-model.md §4).
 */
export function evaluateTransitiveFreshness(
  input: TransitiveFreshnessInputV,
): TransitiveFreshnessResultV {
  if (!Array.isArray(input.consumed)) {
    throw new Error("consumed must be an array");
  }

  const moved: ConsumedReceiptPin[] = [];
  const evaluations = input.consumed.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`consumed[${index}] must be an object`);
    }
    const pin = normalizeConsumedReceiptPin(entry.pin, `consumed[${index}].pin`);
    const current = resolveFacetFingerprint(
      assertFingerprintMap(entry.current_fingerprints, `consumed[${index}].current_fingerprints`),
      pin.facet,
    );
    const outcome: PinFreshnessOutcome =
      current === pin.fingerprint ? "fresh" : "moved";
    if (outcome === "moved") {
      moved.push(pin);
    }
    return {
      producer: pin.producer,
      facet: pin.facet,
      pinned_fingerprint: pin.fingerprint,
      current_fingerprint: current,
      outcome,
    } satisfies PinFreshnessEvaluation;
  });

  return {
    outcome: moved.length === 0 ? "fresh" : "moved",
    evaluations,
    moved,
  };
}

// ---------------------------------------------------------------------------
// 3. The memo key's second half — the consumed-fingerprint tuple in resolved
//    subscription order (SHAPES §3; architecture.md §6.1; world-model.md §4)
// ---------------------------------------------------------------------------

/**
 * The resolved order of a subscriber's input facets — the order its topology
 * edges are sorted into, so `input_fingerprints` is stable across renders
 * (SHAPES §3: "order is the resolved subscription order from the topology").
 */
export interface ResolvedSubscriptionV {
  readonly producer: string;
  readonly facet: Facet;
}

/**
 * Resolve a subscriber's input subscriptions from the topology world-model, in
 * a stable, deterministic order (by `producer` then `facet`). These are the
 * node's "props": each edge `subscriber.Requires.<facet>` → `producer.Maintains
 * .<facet>` (architecture.md §6.3) is one input slot.
 */
export function resolveSubscriptions(
  topology: TopologyWorldModel,
  subscriber: string,
): readonly ResolvedSubscriptionV[] {
  assertTopology(topology);
  assertNonEmptyString(subscriber, "subscriber");

  return topology.edges
    .filter((edge) => edge.subscriber === subscriber)
    .map((edge) => ({ producer: edge.producer, facet: normalizeFacet(edge.facet) }))
    .sort(compareSubscription);
}

/**
 * Build the ordered `input_fingerprints` tuple — the memo key's second half —
 * from a subscriber's pins, in resolved subscription order. One slot per
 * subscribed facet (architecture.md §6.1). Throws if a resolved subscription has
 * no matching pin (the render must pin every input it consumes) or if a pin is
 * unmatched (it consumed something not in the topology).
 */
export function buildInputFingerprints(
  subscriptions: readonly ResolvedSubscriptionV[],
  pins: readonly ConsumedReceiptPin[],
): InputFingerprints {
  if (!Array.isArray(subscriptions)) {
    throw new Error("subscriptions must be an array");
  }
  const pinIndex = indexPinsBySubscription(pins);

  const consumed = new Set<string>();
  const fingerprints = subscriptions.map((subscription, index) => {
    const producer = assertNonEmptyStringValue(
      subscription.producer,
      `subscriptions[${index}].producer`,
    );
    const facet = normalizeFacet(subscription.facet);
    const key = subscriptionKey(producer, facet);
    const pin = pinIndex.get(key);
    if (pin === undefined) {
      throw new Error(`no pin for subscription ${producer}.${facet}`);
    }
    consumed.add(key);
    return pin.fingerprint;
  });

  for (const key of pinIndex.keys()) {
    if (!consumed.has(key)) {
      throw new Error(`pin ${key} has no matching subscription`);
    }
  }

  return Object.freeze(fingerprints);
}

/**
 * Compose the full memo key for a subscriber render: the contract fingerprint
 * plus the ordered input-fingerprint tuple resolved from its pins. EXACTLY
 * `(contract_fingerprint, input_fingerprints)` — nothing else (world-model.md
 * §4; SHAPES §3). The reconciler compares this to the node's last receipt to
 * decide skip-vs-render.
 */
export function composeSubscriberMemoKey(input: {
  readonly contract_fingerprint: Fingerprint;
  readonly subscriptions: readonly ResolvedSubscriptionV[];
  readonly pins: readonly ConsumedReceiptPin[];
}): MemoKey {
  assertNonEmptyString(input.contract_fingerprint, "contract_fingerprint");
  const inputFingerprints = buildInputFingerprints(input.subscriptions, input.pins);
  return makeMemoKey(input.contract_fingerprint, inputFingerprints);
}

// ---------------------------------------------------------------------------
// 4. Propagation-by-topology-edge (architecture.md §4.1, §6.3; world-model.md §8)
// ---------------------------------------------------------------------------

/** One downstream wake target: a subscriber and the moved facet that woke it. */
export interface PropagationTargetV {
  readonly subscriber: string;
  readonly producer: string;
  readonly facet: Facet;
}

export interface CompositionPropagationInputV {
  /** The topology world-model whose edges resolve propagation targets (§6.3). */
  readonly topology: TopologyWorldModel;
  /** The committed receipt that may propagate. */
  readonly receipt: Receipt;
  /**
   * The producer's PRIOR published fingerprints (the receipt's `prev` truth), or
   * `null` at cold start. A facet propagates iff its token in `receipt
   * .fingerprints` differs from the prior token (world-model.md §8: "only
   * `rendered` with a moved fingerprint propagates"). At cold start every
   * declared facet is treated as moved.
   */
  readonly prior_fingerprints: FingerprintMap | null;
}

export type CompositionPropagationPlan =
  | {
      /** The receipt did not propagate: `skipped`/`failed`, or no facet moved. */
      readonly outcome: "no-propagation";
      readonly reason: "not-rendered" | "no-facet-moved";
      readonly moved_facets: readonly Facet[];
      readonly targets: readonly [];
    }
  | {
      readonly outcome: "propagate";
      /** The facets whose fingerprint moved on this receipt. */
      readonly moved_facets: readonly Facet[];
      /** The downstream subscribers to wake, deduped + ordered deterministically. */
      readonly targets: readonly PropagationTargetV[];
    };

/**
 * Plan downstream propagation for a committed receipt. Only a `rendered` receipt
 * whose fingerprint moved propagates; `skipped`/`failed` and unmoved-fingerprint
 * renders wake nothing (world-model.md §8; architecture.md §4.1). The moved
 * facets are resolved by comparing the receipt's `fingerprints` to the prior
 * published map; the wake targets are the topology edges whose `producer` is
 * this node and whose `facet` moved (architecture.md §6.3). No memoized verdict,
 * no judge — pure fingerprint comparison + edge lookup.
 */
export function planCompositionPropagation(
  input: CompositionPropagationInputV,
): CompositionPropagationPlan {
  assertTopology(input.topology);
  const receipt = input.receipt;
  if (!isRecord(receipt)) {
    throw new Error("receipt must be an object");
  }
  assertNonEmptyString(receipt.node, "receipt.node");
  const currentFingerprints = assertFingerprintMap(
    receipt.fingerprints,
    "receipt.fingerprints",
  );

  if (receipt.status !== "rendered") {
    return {
      outcome: "no-propagation",
      reason: "not-rendered",
      moved_facets: [],
      targets: [],
    };
  }

  const movedFacets = computeMovedFacets(
    currentFingerprints,
    input.prior_fingerprints,
  );
  if (movedFacets.length === 0) {
    return {
      outcome: "no-propagation",
      reason: "no-facet-moved",
      moved_facets: [],
      targets: [],
    };
  }

  const movedSet = new Set<Facet>(movedFacets);
  const targets = input.topology.edges
    .filter((edge) => edge.producer === receipt.node && edgeFacetMoved(edge, movedSet))
    .map((edge) => ({
      subscriber: edge.subscriber,
      producer: edge.producer,
      facet: normalizeFacet(edge.facet),
    }))
    .sort(comparePropagationTarget);

  return {
    outcome: "propagate",
    moved_facets: movedFacets,
    targets,
  };
}

/**
 * The facets whose token moved between the prior and current published maps. At
 * cold start (`prior === null`) every facet in the current map is "moved" (the
 * node just published its first truth). Otherwise a facet moves iff its token
 * differs (or is net-new). The reserved `ATOMIC_FACET` is included like any
 * other facet (world-model.md §8).
 */
export function computeMovedFacets(
  current: FingerprintMap,
  prior: FingerprintMap | null,
): readonly Facet[] {
  assertFingerprintMap(current, "current");
  if (prior !== null) {
    assertFingerprintMap(prior, "prior");
  }

  const moved: Facet[] = [];
  for (const facet of Object.keys(current).sort(compareFacet)) {
    const currentToken = current[facet];
    if (prior === null || prior[facet] !== currentToken) {
      moved.push(facet);
    }
  }
  return moved;
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function edgeFacetMoved(edge: TopologyEdge, movedSet: ReadonlySet<Facet>): boolean {
  // An edge subscribes to a producer facet; the atomic edge (no declared facet)
  // is woken when the atomic token — the whole truth — moved.
  return movedSet.has(normalizeFacet(edge.facet));
}

function indexPinsBySubscription(
  pins: readonly ConsumedReceiptPin[],
): ReadonlyMap<string, ConsumedReceiptPin> {
  if (!Array.isArray(pins)) {
    throw new Error("pins must be an array");
  }
  const index = new Map<string, ConsumedReceiptPin>();
  for (const [i, raw] of pins.entries()) {
    const pin = normalizeConsumedReceiptPin(raw, `pins[${i}]`);
    const key = subscriptionKey(pin.producer, pin.facet);
    if (index.has(key)) {
      throw new Error(`duplicate pin for ${pin.producer}.${pin.facet}`);
    }
    index.set(key, pin);
  }
  return index;
}

function normalizeConsumedReceiptPin(value: unknown, path: string): ConsumedReceiptPin {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  assertExactKeys(value, path, ["producer", "facet", "version", "fingerprint"]);
  const producer = assertNonEmptyStringValue(value["producer"], `${path}.producer`);
  const facet = normalizeFacet(value["facet"]);
  assertContentAddress(value["version"], `${path}.version`);
  const fingerprint = assertNonEmptyStringValue(
    value["fingerprint"],
    `${path}.fingerprint`,
  );
  return {
    producer,
    facet,
    version: value["version"],
    fingerprint,
  };
}

function subscriptionKey(producer: string, facet: Facet): string {
  return JSON.stringify([producer, facet]);
}

function compareSubscription(
  left: ResolvedSubscriptionV,
  right: ResolvedSubscriptionV,
): number {
  return (
    left.producer.localeCompare(right.producer) ||
    left.facet.localeCompare(right.facet)
  );
}

function comparePropagationTarget(
  left: PropagationTargetV,
  right: PropagationTargetV,
): number {
  return (
    left.subscriber.localeCompare(right.subscriber) ||
    left.facet.localeCompare(right.facet)
  );
}

function compareFacet(left: Facet, right: Facet): number {
  return left.localeCompare(right);
}

function normalizeFacet(value: unknown): Facet {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("facet must be a non-empty string");
  }
  return value;
}

function assertTopology(topology: unknown): asserts topology is TopologyWorldModel {
  if (!isRecord(topology)) {
    throw new Error("topology must be an object");
  }
  if (!Array.isArray(topology["edges"])) {
    throw new Error("topology.edges must be an array");
  }
  for (const [index, edge] of topology["edges"].entries()) {
    if (!isRecord(edge)) {
      throw new Error(`topology.edges[${index}] must be an object`);
    }
    assertNonEmptyString(edge["subscriber"], `topology.edges[${index}].subscriber`);
    assertNonEmptyString(edge["producer"], `topology.edges[${index}].producer`);
    normalizeFacet(edge["facet"]);
  }
}

function assertWorldModelRef(value: unknown, path: string): asserts value is WorldModelRef {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  assertNonEmptyString(value["node"], `${path}.node`);
  if (value["workspace"] !== "published" && value["workspace"] !== "workspace") {
    throw new Error(`${path}.workspace must be "published" or "workspace"`);
  }
  assertNonEmptyString(value["location"], `${path}.location`);
}

function assertFingerprintMap(value: unknown, path: string): FingerprintMap {
  if (!isRecord(value)) {
    throw new Error(`${path} must be an object`);
  }
  for (const [facet, token] of Object.entries(value)) {
    if (facet.length === 0) {
      throw new Error(`${path} contains an empty facet name`);
    }
    if (typeof token !== "string" || token.length === 0) {
      throw new Error(`${path}.${facet} must be a non-empty fingerprint`);
    }
  }
  if (value[ATOMIC_FACET] === undefined) {
    throw new Error(`${path} must contain the reserved ${ATOMIC_FACET} token`);
  }
  return value as FingerprintMap;
}

function assertExactKeys(
  value: Readonly<Record<string, unknown>>,
  path: string,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${path}.${key} is not a recognized field`);
    }
  }
}

function assertContentAddress(value: unknown, path: string): asserts value is ContentAddress {
  if (typeof value !== "string" || !CONTENT_ADDRESS_PATTERN.test(value)) {
    throw new Error(`${path} must be a sha256 content address`);
  }
}

function assertNonEmptyString(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

function assertNonEmptyStringValue(value: unknown, path: string): string {
  assertNonEmptyString(value, path);
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
