import { deepEqual, equal, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  ATOMIC_FACET,
  type FingerprintMap,
  type Receipt,
  type TopologyWorldModel,
  type WorldModelRef,
} from "../../shapes";
import {
  type ConsumedReceiptPin,
  buildInputFingerprints,
  composeSubscriberMemoKey,
  computeMovedFacets,
  evaluateTransitiveFreshness,
  pinConsumedWorldModel,
  planCompositionPropagation,
  resolveFacetFingerprint,
  resolveSubscriptions,
  selectInputFingerprints,
} from "../index";

const VERSION_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const VERSION_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;

function published(node: string, version: typeof VERSION_A): WorldModelRef {
  return { node, workspace: "published", location: `/wm/${node}`, version };
}

function atomic(token: string): FingerprintMap {
  return { [ATOMIC_FACET]: token };
}

// --- pins: cross-node read isolation (architecture.md §8; delta.md §A3.4) ---

test("pinConsumedWorldModel captures version + consumed facet token", () => {
  const pin = pinConsumedWorldModel({
    producer: "vendor",
    facet: ATOMIC_FACET,
    world_model: published("vendor", VERSION_A),
    fingerprints: atomic("fp:vendor-1"),
  });

  deepEqual(pin, {
    producer: "vendor",
    facet: ATOMIC_FACET,
    version: VERSION_A,
    fingerprint: "fp:vendor-1",
  } satisfies ConsumedReceiptPin);
});

test("pinConsumedWorldModel resolves an undeclared facet through the atomic token", () => {
  const pin = pinConsumedWorldModel({
    producer: "vendor",
    facet: "recommendation",
    world_model: published("vendor", VERSION_A),
    fingerprints: atomic("fp:vendor-1"),
  });
  equal(pin.facet, "recommendation");
  equal(pin.fingerprint, "fp:vendor-1");
});

test("pinConsumedWorldModel uses a declared facet token when present", () => {
  const pin = pinConsumedWorldModel({
    producer: "vendor",
    facet: "recommendation",
    world_model: published("vendor", VERSION_A),
    fingerprints: { [ATOMIC_FACET]: "fp:whole", recommendation: "fp:rec" },
  });
  equal(pin.fingerprint, "fp:rec");
});

test("pinConsumedWorldModel rejects a workspace (never-fingerprinted) ref", () => {
  throws(
    () =>
      pinConsumedWorldModel({
        producer: "vendor",
        facet: ATOMIC_FACET,
        world_model: { node: "vendor", workspace: "workspace", location: "/scratch", version: null },
        fingerprints: atomic("fp:vendor-1"),
      }),
    /workspace is never pinned/,
  );
});

test("pinConsumedWorldModel rejects a cold-start (null version) world-model", () => {
  throws(
    () =>
      pinConsumedWorldModel({
        producer: "vendor",
        facet: ATOMIC_FACET,
        world_model: { node: "vendor", workspace: "published", location: "/wm/vendor", version: null },
        fingerprints: atomic("fp:vendor-1"),
      }),
    /cold-start/,
  );
});

test("resolveFacetFingerprint requires the reserved atomic token", () => {
  throws(
    () => resolveFacetFingerprint({ recommendation: "fp:rec" } as FingerprintMap, "missing"),
    new RegExp(ATOMIC_FACET),
  );
});

// --- transitive freshness = pure fingerprint comparison (world-model.md §5) ---

test("evaluateTransitiveFreshness reports fresh when no pinned facet moved", () => {
  const pin: ConsumedReceiptPin = {
    producer: "vendor",
    facet: ATOMIC_FACET,
    version: VERSION_A,
    fingerprint: "fp:vendor-1",
  };
  const result = evaluateTransitiveFreshness({
    consumed: [{ pin, current_fingerprints: atomic("fp:vendor-1") }],
  });
  equal(result.outcome, "fresh");
  deepEqual(result.moved, []);
});

test("evaluateTransitiveFreshness reports moved when a pinned facet token changed", () => {
  const pin: ConsumedReceiptPin = {
    producer: "vendor",
    facet: ATOMIC_FACET,
    version: VERSION_A,
    fingerprint: "fp:vendor-1",
  };
  const result = evaluateTransitiveFreshness({
    consumed: [{ pin, current_fingerprints: atomic("fp:vendor-2") }],
  });
  equal(result.outcome, "moved");
  deepEqual(result.moved, [pin]);
  equal(result.evaluations[0]!.outcome, "moved");
});

// --- input_fingerprints + memo key (SHAPES §3; world-model.md §4) ---

const TOPOLOGY: TopologyWorldModel = {
  nodes: [
    { node: "risk", contract_fingerprint: "c:risk", wake_source: "input" },
    { node: "spend", contract_fingerprint: "c:spend", wake_source: "input" },
    { node: "owner", contract_fingerprint: "c:owner", wake_source: "input" },
  ],
  edges: [
    { subscriber: "risk", producer: "spend", facet: ATOMIC_FACET },
    { subscriber: "risk", producer: "owner", facet: "signal" },
  ],
  entry_points: [],
  acyclic: true,
};

test("resolveSubscriptions returns a subscriber's edges in deterministic order", () => {
  deepEqual(resolveSubscriptions(TOPOLOGY, "risk"), [
    { producer: "owner", facet: "signal" },
    { producer: "spend", facet: ATOMIC_FACET },
  ]);
});

test("buildInputFingerprints orders tokens by resolved subscription order", () => {
  const pins: ConsumedReceiptPin[] = [
    { producer: "spend", facet: ATOMIC_FACET, version: VERSION_A, fingerprint: "fp:spend" },
    { producer: "owner", facet: "signal", version: VERSION_B, fingerprint: "fp:owner" },
  ];
  const subscriptions = resolveSubscriptions(TOPOLOGY, "risk");
  // owner.signal sorts before spend.@atomic
  deepEqual(buildInputFingerprints(subscriptions, pins), ["fp:owner", "fp:spend"]);
});

test("buildInputFingerprints rejects a missing pin", () => {
  const subscriptions = resolveSubscriptions(TOPOLOGY, "risk");
  throws(
    () =>
      buildInputFingerprints(subscriptions, [
        { producer: "spend", facet: ATOMIC_FACET, version: VERSION_A, fingerprint: "fp:spend" },
      ]),
    /no pin for subscription owner.signal/,
  );
});

test("buildInputFingerprints rejects an unmatched pin", () => {
  const subscriptions = resolveSubscriptions(TOPOLOGY, "risk");
  throws(
    () =>
      buildInputFingerprints(subscriptions, [
        { producer: "spend", facet: ATOMIC_FACET, version: VERSION_A, fingerprint: "fp:spend" },
        { producer: "owner", facet: "signal", version: VERSION_B, fingerprint: "fp:owner" },
        { producer: "ghost", facet: ATOMIC_FACET, version: VERSION_A, fingerprint: "fp:ghost" },
      ]),
    /has no matching subscription/,
  );
});

test("composeSubscriberMemoKey is exactly (contract_fingerprint, input_fingerprints)", () => {
  const pins: ConsumedReceiptPin[] = [
    { producer: "spend", facet: ATOMIC_FACET, version: VERSION_A, fingerprint: "fp:spend" },
    { producer: "owner", facet: "signal", version: VERSION_B, fingerprint: "fp:owner" },
  ];
  const key = composeSubscriberMemoKey({
    contract_fingerprint: "c:risk",
    subscriptions: resolveSubscriptions(TOPOLOGY, "risk"),
    pins,
  });
  deepEqual(Object.keys(key).sort(), ["contract_fingerprint", "input_fingerprints"]);
  equal(key.contract_fingerprint, "c:risk");
  deepEqual(key.input_fingerprints, ["fp:owner", "fp:spend"]);
});

// --- selectInputFingerprints: the run-half selector boundary -------------
//     (architecture.md §3.2 selector boundary; world-model.md §3; SHAPES §3)

// A 2-producer-facet producer "vendor" exposing facets X and Y, plus a sibling
// producer "spend". Two subscribers: "x_sub" subscribes ONLY to vendor.X;
// "atomic_sub" subscribes to the whole truth of "spend" (atomic-only).
const FACETED_TOPOLOGY: TopologyWorldModel = {
  nodes: [
    { node: "vendor", contract_fingerprint: "c:vendor", wake_source: "input" },
    { node: "spend", contract_fingerprint: "c:spend", wake_source: "input" },
    { node: "x_sub", contract_fingerprint: "c:x", wake_source: "input" },
    { node: "atomic_sub", contract_fingerprint: "c:a", wake_source: "input" },
  ],
  edges: [
    { subscriber: "x_sub", producer: "vendor", facet: "X" },
    { subscriber: "atomic_sub", producer: "spend", facet: ATOMIC_FACET },
  ],
  entry_points: [],
  acyclic: true,
};

test("selectInputFingerprints consumes EXACTLY the subscribed facet (X), not the atomic token", () => {
  const fps: Record<string, FingerprintMap> = {
    vendor: { [ATOMIC_FACET]: "fp:whole-1", X: "fp:x-1", Y: "fp:y-1" },
  };
  const tuple = selectInputFingerprints(
    FACETED_TOPOLOGY,
    "x_sub",
    (p) => fps[p]!,
  );
  // exactly one slot, carrying vendor.X's token — not the atomic/whole token.
  deepEqual(tuple, ["fp:x-1"]);
});

test("selectInputFingerprints: a move in facet Y does NOT change an X-subscriber's tuple (selector boundary)", () => {
  const before = selectInputFingerprints(
    FACETED_TOPOLOGY,
    "x_sub",
    () => ({ [ATOMIC_FACET]: "fp:whole-1", X: "fp:x-1", Y: "fp:y-1" }),
  );
  // Y moved (and so the atomic/whole token moved), X held.
  const after = selectInputFingerprints(
    FACETED_TOPOLOGY,
    "x_sub",
    () => ({ [ATOMIC_FACET]: "fp:whole-2", X: "fp:x-1", Y: "fp:y-2" }),
  );
  deepEqual(before, after, "Y moving leaves the X-subscriber's tuple untouched");
});

test("selectInputFingerprints: a move in facet X DOES change the X-subscriber's tuple (it must wake)", () => {
  const before = selectInputFingerprints(
    FACETED_TOPOLOGY,
    "x_sub",
    () => ({ [ATOMIC_FACET]: "fp:whole-1", X: "fp:x-1", Y: "fp:y-1" }),
  );
  const after = selectInputFingerprints(
    FACETED_TOPOLOGY,
    "x_sub",
    () => ({ [ATOMIC_FACET]: "fp:whole-2", X: "fp:x-2", Y: "fp:y-1" }),
  );
  deepEqual(before, ["fp:x-1"]);
  deepEqual(after, ["fp:x-2"]);
});

test("selectInputFingerprints: an atomic-only subscriber resolves the whole-truth token (unchanged behavior)", () => {
  const tuple = selectInputFingerprints(
    FACETED_TOPOLOGY,
    "atomic_sub",
    () => atomic("fp:spend-1"),
  );
  deepEqual(tuple, ["fp:spend-1"]);
});

test("selectInputFingerprints: an atomic-only subscriber of a faceted producer still resolves the atomic token", () => {
  // subscriber declares no facet (ATOMIC_FACET) but the producer has facets;
  // it consumes the whole-truth token, so it wakes on ANY change (world-model.md §3).
  const topo: TopologyWorldModel = {
    nodes: [],
    edges: [{ subscriber: "whole_sub", producer: "vendor", facet: ATOMIC_FACET }],
    entry_points: [],
    acyclic: true,
  };
  const tuple = selectInputFingerprints(topo, "whole_sub", () => ({
    [ATOMIC_FACET]: "fp:whole-9",
    X: "fp:x",
    Y: "fp:y",
  }));
  deepEqual(tuple, ["fp:whole-9"]);
});

// --- propagation by topology edge (architecture.md §4.1, §6.3) ---

function rendered(node: string, fingerprints: FingerprintMap): Receipt {
  return {
    node,
    contract_fingerprint: `c:${node}`,
    wake: { source: "input", refs: [] },
    input_fingerprints: [],
    fingerprints,
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: { provider: "p", model: "m", tokens: { fresh: 0, reused: 0 }, surprise_cause: "input" },
    sig: { scheme: "none", null_reason: "no-signer-adapter-configured" },
  };
}

test("computeMovedFacets treats cold start (null prior) as every facet moved", () => {
  deepEqual(
    computeMovedFacets({ [ATOMIC_FACET]: "fp:1", signal: "fp:s" }, null),
    [ATOMIC_FACET, "signal"],
  );
});

test("computeMovedFacets reports only the facets whose token changed", () => {
  deepEqual(
    computeMovedFacets(
      { [ATOMIC_FACET]: "fp:2", signal: "fp:s" },
      { [ATOMIC_FACET]: "fp:1", signal: "fp:s" },
    ),
    [ATOMIC_FACET],
  );
});

test("planCompositionPropagation wakes only subscribers to the moved facet", () => {
  const plan = planCompositionPropagation({
    topology: TOPOLOGY,
    receipt: rendered("owner", { [ATOMIC_FACET]: "fp:o2", signal: "fp:s2" }),
    prior_fingerprints: { [ATOMIC_FACET]: "fp:o1", signal: "fp:s1" },
  });
  equal(plan.outcome, "propagate");
  if (plan.outcome !== "propagate") return;
  // risk subscribes to owner.signal — the signal facet moved, so it wakes.
  deepEqual(plan.targets, [{ subscriber: "risk", producer: "owner", facet: "signal" }]);
});

test("planCompositionPropagation does not wake when the subscribed facet is unmoved", () => {
  const plan = planCompositionPropagation({
    topology: TOPOLOGY,
    // only the atomic token moved; risk subscribes to owner.signal which held.
    receipt: rendered("owner", { [ATOMIC_FACET]: "fp:o2", signal: "fp:s1" }),
    prior_fingerprints: { [ATOMIC_FACET]: "fp:o1", signal: "fp:s1" },
  });
  equal(plan.outcome, "propagate");
  if (plan.outcome !== "propagate") return;
  deepEqual(plan.targets, []);
});

test("planCompositionPropagation does not propagate a skipped receipt", () => {
  const receipt = { ...rendered("owner", atomic("fp:o1")), status: "skipped" as const };
  const plan = planCompositionPropagation({
    topology: TOPOLOGY,
    receipt,
    prior_fingerprints: atomic("fp:o0"),
  });
  equal(plan.outcome, "no-propagation");
  if (plan.outcome !== "no-propagation") return;
  equal(plan.reason, "not-rendered");
});

test("planCompositionPropagation does not propagate a failed receipt", () => {
  const receipt = { ...rendered("owner", atomic("fp:o1")), status: "failed" as const };
  const plan = planCompositionPropagation({
    topology: TOPOLOGY,
    receipt,
    prior_fingerprints: atomic("fp:o0"),
  });
  equal(plan.outcome, "no-propagation");
});

test("planCompositionPropagation does not propagate when no facet moved", () => {
  const plan = planCompositionPropagation({
    topology: TOPOLOGY,
    receipt: rendered("owner", { [ATOMIC_FACET]: "fp:o1", signal: "fp:s1" }),
    prior_fingerprints: { [ATOMIC_FACET]: "fp:o1", signal: "fp:s1" },
  });
  equal(plan.outcome, "no-propagation");
  if (plan.outcome !== "no-propagation") return;
  equal(plan.reason, "no-facet-moved");
});
