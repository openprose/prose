// Tests for the reshaped evidence-plan module: evidence-by-reference resolution.
// The judge-coupled shallow/deep-roam plan is DELETED (delta.md §A3.7); these
// tests cover only the surviving seam — resolving a subscriber's upstream
// evidence BY REFERENCE from the topology edges + the waking receipt(s)
// (architecture.md §1 L44–L48, §8 L321–L323; delta.md §A3.1 L140).

import { deepEqual, equal, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import {
  type WakingReceipt,
  atomicFingerprintOf,
  readPublishedFacetFingerprint,
  resolveEvidenceByReference,
} from "../index";
import {
  ATOMIC_FACET,
  type ContentAddress,
  type FingerprintMap,
  type Receipt,
  type TopologyEdge,
  type Wake,
  createNullSignature,
} from "../../shapes";

const CA_A =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const CA_B =
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const FP_PUBLISHED =
  "sha256:1111111111111111111111111111111111111111111111111111111111111111" as const;
const FP_FACET =
  "sha256:2222222222222222222222222222222222222222222222222222222222222222" as const;

test("resolves one input per subscribed edge, pinned to the producer's published version", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "briefing", producer: "incidents", facet: ATOMIC_FACET },
  ];
  const wake: Wake = { source: "input", refs: [CA_A] };
  const waking: WakingReceipt[] = [
    {
      ref: CA_A,
      receipt: makeReceipt("incidents", {
        [ATOMIC_FACET]: FP_PUBLISHED,
      }),
    },
  ];

  const resolution = resolveEvidenceByReference(
    "briefing",
    edges,
    wake,
    waking,
  );

  equal(resolution.subscriber, "briefing");
  equal(resolution.inputs.length, 1);
  const input = resolution.inputs[0]!;
  equal(input.producer, "incidents");
  equal(input.facet, ATOMIC_FACET);
  equal(input.fingerprint, FP_PUBLISHED);
  // Read BY REFERENCE: published workspace, pinned to the atomic version.
  equal(input.ref.node, "incidents");
  equal(input.ref.workspace, "published");
  equal(input.ref.version, FP_PUBLISHED);
});

test("input_fingerprints is the consumed tuple in resolved subscription (edge) order", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "briefing", producer: "incidents", facet: ATOMIC_FACET },
    { subscriber: "briefing", producer: "owners", facet: "directory" },
  ];
  const wake: Wake = { source: "input", refs: [CA_A, CA_B] };
  const waking: WakingReceipt[] = [
    {
      ref: CA_A,
      receipt: makeReceipt("incidents", { [ATOMIC_FACET]: FP_PUBLISHED }),
    },
    {
      ref: CA_B,
      receipt: makeReceipt("owners", {
        [ATOMIC_FACET]: CA_B,
        directory: FP_FACET,
      }),
    },
  ];

  const resolution = resolveEvidenceByReference(
    "briefing",
    edges,
    wake,
    waking,
  );

  // The tuple is the memo key's second half (SHAPES.md §3), in edge order.
  deepEqual(resolution.input_fingerprints, [FP_PUBLISHED, FP_FACET]);
});

test("a facet subscription pins the producer's per-facet fingerprint, not the atomic one", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "briefing", producer: "owners", facet: "directory" },
  ];
  const waking: WakingReceipt[] = [
    {
      ref: CA_B,
      receipt: makeReceipt("owners", {
        [ATOMIC_FACET]: CA_B,
        directory: FP_FACET,
      }),
    },
  ];

  const resolution = resolveEvidenceByReference(
    "briefing",
    edges,
    { source: "input", refs: [CA_B] },
    waking,
  );

  equal(resolution.inputs[0]!.fingerprint, FP_FACET);
  // The version still pins the producer's published artifact (the atomic CA).
  equal(resolution.inputs[0]!.ref.version, CA_B);
});

test("ignores edges that belong to other subscribers", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "other", producer: "incidents", facet: ATOMIC_FACET },
    { subscriber: "briefing", producer: "incidents", facet: ATOMIC_FACET },
  ];
  const waking: WakingReceipt[] = [
    {
      ref: CA_A,
      receipt: makeReceipt("incidents", { [ATOMIC_FACET]: FP_PUBLISHED }),
    },
  ];

  const resolution = resolveEvidenceByReference(
    "briefing",
    edges,
    { source: "input", refs: [CA_A] },
    waking,
  );

  equal(resolution.inputs.length, 1);
  equal(resolution.inputs[0]!.subscriber, "briefing");
});

test("self-driven and external wakes resolve uniformly (every wake is a receipt)", () => {
  // A self wake carries a synthetic self-receipt; with no subscribed edges the
  // resolution is simply empty inputs (the node renders on its own clock).
  const resolution = resolveEvidenceByReference(
    "scheduler",
    [],
    { source: "self", refs: [CA_A] },
    [
      {
        ref: CA_A,
        receipt: makeReceipt("scheduler", { [ATOMIC_FACET]: FP_PUBLISHED }),
      },
    ],
  );

  equal(resolution.wake.source, "self");
  deepEqual(resolution.input_fingerprints, []);
});

test("uses a supplied location map when the store provides concrete artifact paths", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "briefing", producer: "incidents", facet: ATOMIC_FACET },
  ];
  const waking: WakingReceipt[] = [
    {
      ref: CA_A,
      receipt: makeReceipt("incidents", { [ATOMIC_FACET]: FP_PUBLISHED }),
    },
  ];

  const resolution = resolveEvidenceByReference(
    "briefing",
    edges,
    { source: "input", refs: [CA_A] },
    waking,
    { locations: { incidents: "/wm/incidents/published" } },
  );

  equal(resolution.inputs[0]!.ref.location, "/wm/incidents/published");
});

test("throws when a subscribed edge has no waking receipt (topology invariant)", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "briefing", producer: "incidents", facet: ATOMIC_FACET },
  ];

  throws(
    () =>
      resolveEvidenceByReference(
        "briefing",
        edges,
        { source: "input", refs: [] },
        [],
      ),
    /no waking receipt for producer incidents/,
  );
});

test("throws when the producer published no fingerprint for the required facet", () => {
  const edges: TopologyEdge[] = [
    { subscriber: "briefing", producer: "owners", facet: "directory" },
  ];
  const waking: WakingReceipt[] = [
    {
      ref: CA_B,
      // No `directory` facet published.
      receipt: makeReceipt("owners", { [ATOMIC_FACET]: CA_B }),
    },
  ];

  throws(
    () =>
      resolveEvidenceByReference(
        "briefing",
        edges,
        { source: "input", refs: [CA_B] },
        waking,
      ),
    /published no fingerprint for facet directory/,
  );
});

test("throws on ambiguous waking receipts for one producer", () => {
  const waking: WakingReceipt[] = [
    {
      ref: CA_A,
      receipt: makeReceipt("incidents", { [ATOMIC_FACET]: FP_PUBLISHED }),
    },
    {
      ref: CA_B,
      receipt: makeReceipt("incidents", { [ATOMIC_FACET]: CA_B }),
    },
  ];

  throws(
    () =>
      resolveEvidenceByReference(
        "briefing",
        [{ subscriber: "briefing", producer: "incidents", facet: ATOMIC_FACET }],
        { source: "input", refs: [CA_A, CA_B] },
        waking,
      ),
    /ambiguous waking receipts for producer incidents/,
  );
});

test("readPublishedFacetFingerprint + atomicFingerprintOf read the published map", () => {
  const fps: FingerprintMap = {
    [ATOMIC_FACET]: FP_PUBLISHED,
    directory: FP_FACET,
  };
  equal(readPublishedFacetFingerprint(fps, "directory"), FP_FACET);
  equal(readPublishedFacetFingerprint(fps, "missing"), undefined);
  equal(atomicFingerprintOf(fps), FP_PUBLISHED);
});

function makeReceipt(node: string, fingerprints: FingerprintMap): Receipt {
  return {
    node,
    contract_fingerprint: CA_A,
    wake: { source: "input", refs: [] },
    input_fingerprints: [],
    fingerprints,
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: {
      provider: "cradle-double",
      model: "deterministic-replay",
      tokens: { fresh: 0, reused: 1 },
      surprise_cause: "input",
    },
    sig: createNullSignature(),
  };
}
