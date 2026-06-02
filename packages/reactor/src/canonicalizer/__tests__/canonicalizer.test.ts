import { deepEqual, equal, notEqual, ok, throws } from "node:assert/strict";
import { test } from "node:test";

import { ATOMIC_FACET, asFacet} from "../../shapes";
import {
  atomicOnlySpec,
  canonicalizerArtifactId,
  compileNode,
  digestCanonical,
  lintStructuredBacking,
  stableStringify,
  type CanonicalizationSpec,
  type WorldModelValue,
} from "../index";

// The canonical eval shape (delta.md §B7 / architecture.md §10): a vendor /
// competitor-monitor truth with a recommendation, a control set, and an
// immaterial `fetched_at` poll timestamp that must NOT move the fingerprint.
const VENDOR_WM: WorldModelValue = {
  recommendation: { status: "renew", confidence: 0.82 },
  controls: ["soc2", "iso27001", "pentest"],
  fetched_at: "2026-05-29T10:00:00.000Z",
};

function vendorSpec(): CanonicalizationSpec {
  return {
    node: "vendor-renewal-watch",
    default_material: true,
    fields: [
      // `fetched_at` is immaterial — dropping it is the whole point of the
      // compiled canonicalizer (delta.md §A5: immaterial churn must not
      // re-trigger downstreams).
      { path: "fetched_at", material: false },
      // controls is a set: reordering is immaterial (architecture.md §3.2).
      { path: "controls", material: true, collection: "set" },
    ],
    facets: [
      { facet: asFacet("recommendation"), paths: ["recommendation"] },
      { facet: asFacet("controls"), paths: ["controls"] },
    ],
  };
}

test("atomic facet is mandatory, present, and first", () => {
  const { canonicalizer } = compileNode(atomicOnlySpec("leaf"));
  equal(canonicalizer.facets[0], ATOMIC_FACET);
  const fp = canonicalizer.apply({ a: 1 });
  ok(ATOMIC_FACET in fp, "atomic fingerprint always emitted");
});

test("apply is deterministic — same material content yields the same fingerprints", () => {
  const { canonicalizer } = compileNode(vendorSpec());
  const a = canonicalizer.apply(VENDOR_WM);
  const b = canonicalizer.apply(structuredClone(VENDOR_WM) as WorldModelValue);
  deepEqual(a, b);
});

test("immaterial field churn does NOT move any fingerprint (the fetched_at case)", () => {
  const { canonicalizer } = compileNode(vendorSpec());
  const before = canonicalizer.apply(VENDOR_WM);
  const repolled: WorldModelValue = {
    ...(VENDOR_WM as Record<string, WorldModelValue>),
    fetched_at: "2026-06-01T14:30:00.000Z", // a re-poll: timestamp changed only
  };
  const after = canonicalizer.apply(repolled);
  deepEqual(after, before, "re-poll with no material change must not move fingerprints");
});

test("a material change moves the atomic fingerprint", () => {
  const { canonicalizer } = compileNode(vendorSpec());
  const before = canonicalizer.apply(VENDOR_WM);
  const changed: WorldModelValue = {
    ...(VENDOR_WM as Record<string, WorldModelValue>),
    recommendation: { status: "churn", confidence: 0.4 },
  };
  const after = canonicalizer.apply(changed);
  notEqual(after[ATOMIC_FACET], before[ATOMIC_FACET]);
});

test("declared sets are order-insensitive", () => {
  const { canonicalizer } = compileNode(vendorSpec());
  const a = canonicalizer.apply(VENDOR_WM);
  const reordered: WorldModelValue = {
    ...(VENDOR_WM as Record<string, WorldModelValue>),
    controls: ["pentest", "soc2", "iso27001"],
  };
  const b = canonicalizer.apply(reordered);
  equal(b[ATOMIC_FACET], a[ATOMIC_FACET], "set reorder is immaterial");
  equal(b.controls, a.controls);
});

test("object key order and whitespace are immaterial by default", () => {
  const spec = atomicOnlySpec("text-node");
  const { canonicalizer } = compileNode(spec);
  const a = canonicalizer.apply({ x: "hello   world", y: 1 });
  const b = canonicalizer.apply({ y: 1, x: "hello world" });
  equal(a[ATOMIC_FACET], b[ATOMIC_FACET]);
});

test("number tolerance (quantum) absorbs sub-tolerance jitter", () => {
  const spec: CanonicalizationSpec = {
    node: "metric",
    default_material: true,
    facets: [],
    fields: [{ path: "score", material: true, number: { quantum: 0.1 } }],
  };
  const { canonicalizer } = compileNode(spec);
  const a = canonicalizer.apply({ score: 0.82 });
  const b = canonicalizer.apply({ score: 0.83 }); // within 0.1 quantum → 0.8
  equal(a[ATOMIC_FACET], b[ATOMIC_FACET]);
  const c = canonicalizer.apply({ score: 0.95 }); // rounds to 1.0 → different
  notEqual(c[ATOMIC_FACET], a[ATOMIC_FACET]);
});

test("facets are selectors: moving facet Y does not move facet X's fingerprint", () => {
  const { canonicalizer } = compileNode(vendorSpec());
  const before = canonicalizer.apply(VENDOR_WM);
  // Move ONLY the controls facet (add a control).
  const moved: WorldModelValue = {
    ...(VENDOR_WM as Record<string, WorldModelValue>),
    controls: ["soc2", "iso27001", "pentest", "hipaa"],
  };
  const after = canonicalizer.apply(moved);
  notEqual(after.controls, before.controls, "the moved facet moves");
  equal(
    after.recommendation,
    before.recommendation,
    "the untouched facet's fingerprint must NOT move (world-model.md §3 selectors)",
  );
  notEqual(after[ATOMIC_FACET], before[ATOMIC_FACET], "atomic still moves on any change");
});

test("compileNode emits a SHAPES CanonicalizerRef carrying node, artifact, and facets", () => {
  const { ref, canonicalizer } = compileNode(vendorSpec());
  equal(ref.node, "vendor-renewal-watch");
  equal(ref.artifact, canonicalizerArtifactId("vendor-renewal-watch"));
  deepEqual([...ref.facets], [...canonicalizer.facets]);
  equal(ref.facets[0], ATOMIC_FACET);
});

test("structured-backing lint flags a subscribed facet with no structured backing", () => {
  const spec: CanonicalizationSpec = {
    node: "prose-node",
    default_material: true,
    facets: [{ facet: asFacet("summary"), paths: [] }], // free-form prose, no backing
    fields: [],
  };
  const lints = lintStructuredBacking(spec);
  equal(lints.length, 1);
  equal(lints[0]!.facet, "summary");
  ok(lints[0]!.message.includes("structured backing"));
});

test("atomic-only specs are lint-clean", () => {
  deepEqual(lintStructuredBacking(atomicOnlySpec("leaf")), []);
});

test("redeclaring the reserved atomic facet is rejected", () => {
  const spec: CanonicalizationSpec = {
    node: "bad",
    default_material: true,
    fields: [],
    facets: [{ facet: ATOMIC_FACET, paths: ["x"] }],
  };
  throws(() => compileNode(spec), /reserved atomic facet/);
});

test("serialize over an unknown facet throws", () => {
  const { canonicalizer } = compileNode(atomicOnlySpec("leaf"));
  throws(() => canonicalizer.serialize({ a: 1 }, asFacet("nope")), /does not declare facet/);
});

test("digestCanonical is the sha256 content-address convention", () => {
  const addr = digestCanonical(stableStringify({ a: 1 }));
  ok(/^sha256:[a-f0-9]{64}$/.test(addr), "reference convention sha256:<64 hex>");
});

test("non-finite numbers are rejected (deterministic-total reduction)", () => {
  const { canonicalizer } = compileNode(atomicOnlySpec("leaf"));
  throws(() => canonicalizer.apply({ x: Number.POSITIVE_INFINITY }), /non-finite/);
});
