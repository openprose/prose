// Tests for THREADING the COMPILED per-node canonicalizer through the run-phase
// seams — `renderAtom` (standalone) and `mountDag` (mounted). The compile phase
// produces a per-node CompiledCanonicalizer (architecture.md §3.2 L138–L143;
// SHAPES.md §6) that operates on the STRUCTURED `WorldModelValue`; the store's
// `commitPublished(node, files, canonicalizer)` (architecture.md §5.2 L208–L214)
// applies a `WorldModelFiles → FingerprintMap` canonicalizer. `compiledStore-
// Canonicalizer` bridges the two so the canonicalizer the contract COMPILED TO
// is what gets threaded — never the whole-truth `atomicCanonicalizer` fallback.
//
// The behavioral proof is the immaterial-churn case (architecture.md §3.2
// L144–L148; delta.md §A5): a field the spec marks immaterial (`fetched_at`)
// must NOT move the fingerprint, end-to-end through the seam, when the compiled
// canonicalizer is threaded — distinguishing it from the atomic whole-truth
// default (which would re-fingerprint on every churn).

import { deepEqual, equal, notEqual } from "node:assert/strict";
import { test } from "node:test";

import { renderAtom, compiledStoreCanonicalizer } from "../render-atom";
import { mountDag, type MountedRender } from "../mounted-dag";
import {
  InMemoryWorldModelStore,
  jsonFile,
  files,
  readTextFile,
  type WorldModelFiles,
} from "../../world-model";
import {
  compileNode,
  atomicOnlySpec,
  type WorldModelValue,
} from "../../canonicalizer";
import { ATOMIC_FACET, asFingerprint, asNodeId} from "../../shapes";
import { type ReconcilerTopology } from "../../reactor";

const NODE = "responsibility.vendor-truth";
const CONTRACT_FP = "contract:vendor-truth@1";

// The contract's structured-truth projection (architecture.md §3.2 structured-
// backing rule): the world-model keeps its truth in `truth.json`; the projection
// parses those bytes into the `WorldModelValue` the compiled canonicalizer
// reduces. Free-form prose files are excluded (not part of the projection).
const projectTruth = (wm: WorldModelFiles): WorldModelValue =>
  JSON.parse(readTextFile(wm["truth.json"] as Uint8Array));

// The COMPILED per-node canonicalizer: `status` is material; `fetched_at` is
// explicitly immaterial (the falsely-re-triggering field, delta.md §A5).
function compiledVendorCanonicalizer() {
  const { canonicalizer } = compileNode(
    atomicOnlySpec(NODE, [{ path: "fetched_at", material: false }]),
  );
  return compiledStoreCanonicalizer(canonicalizer, projectTruth);
}

test("renderAtom threads the COMPILED canonicalizer: immaterial churn does not move the fingerprint", () => {
  const canonicalizer = compiledVendorCanonicalizer();

  const renderWith = (status: string, fetchedAt: string) => ({
    world_model: files({ "truth.json": jsonFile({ status, fetched_at: fetchedAt }) }),
    cost: { provider: "none", model: "none", tokens: { fresh: 0, reused: 0 }, surprise_cause: "self" as const },
  });

  // Same material `status`, different immaterial `fetched_at` → SAME fingerprint.
  const storeA = new InMemoryWorldModelStore();
  const a1 = renderAtom({
    node: NODE,
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer,
    store: storeA,
    render: () => renderWith("active", "2026-05-01T00:00:00Z"),
  });
  const a2 = renderAtom({
    node: NODE,
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer,
    store: storeA,
    render: () => renderWith("active", "2099-12-31T23:59:59Z"),
  });
  equal(
    a1.receipt.fingerprints[ATOMIC_FACET],
    a2.receipt.fingerprints[ATOMIC_FACET],
    "immaterial fetched_at churn must not move the fingerprint",
  );

  // A material `status` change DOES move the fingerprint.
  const storeB = new InMemoryWorldModelStore();
  const b1 = renderAtom({
    node: NODE,
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer,
    store: storeB,
    render: () => renderWith("active", "2026-05-01T00:00:00Z"),
  });
  const b2 = renderAtom({
    node: NODE,
    contract_fingerprint: asFingerprint(CONTRACT_FP),
    canonicalizer,
    store: storeB,
    render: () => renderWith("expired", "2026-05-01T00:00:00Z"),
  });
  notEqual(
    b1.receipt.fingerprints[ATOMIC_FACET],
    b2.receipt.fingerprints[ATOMIC_FACET],
    "a material status change must move the fingerprint",
  );
});

test("compiledStoreCanonicalizer is what commitPublished applies (not the atomic default)", () => {
  // Prove the threaded canonicalizer reaches the store: the committed fingerprint
  // must equal the compiled canonicalizer applied directly to the same files,
  // and must DIFFER from the atomic whole-truth fingerprint (which would include
  // the immaterial fetched_at).
  const { canonicalizer: compiled } = compileNode(
    atomicOnlySpec(NODE, [{ path: "fetched_at", material: false }]),
  );
  const threaded = compiledStoreCanonicalizer(compiled, projectTruth);

  const wm = files({ "truth.json": jsonFile({ status: "active", fetched_at: "2026-05-01T00:00:00Z" }) });
  const store = new InMemoryWorldModelStore();
  const commit = store.commitPublished(NODE, wm, threaded);

  // Equals the compiled canonicalizer applied to the projected structured truth.
  deepEqual(
    commit.fingerprints,
    compiled.apply(projectTruth(wm)),
    "the threaded compiled canonicalizer is exactly what the store applied",
  );

  // And it is NOT the atomic whole-truth fingerprint of the raw files (which
  // would fold in the immaterial fetched_at), so churn-immunity is real.
  const churned = files({ "truth.json": jsonFile({ status: "active", fetched_at: "2099-12-31T23:59:59Z" }) });
  const store2 = new InMemoryWorldModelStore();
  const wholeTruth = store2.commitPublished(NODE, churned); // defaults to atomicCanonicalizer
  notEqual(
    commit.fingerprints[ATOMIC_FACET],
    wholeTruth.fingerprints[ATOMIC_FACET],
    "the compiled canonicalizer must differ from the atomic whole-truth default",
  );
});

test("mountDag threads each node's COMPILED canonicalizer into commitPublished", () => {
  const { canonicalizer: compiled } = compileNode(
    atomicOnlySpec(NODE, [{ path: "fetched_at", material: false }]),
  );
  const canonicalizer = compiledStoreCanonicalizer(compiled, projectTruth);

  const wm = files({ "truth.json": jsonFile({ status: "active", fetched_at: "2026-05-01T00:00:00Z" }) });
  const vendorRender: MountedRender = (ctx) => ({
    world_model: wm,
    cost: { provider: "none", model: "none", tokens: { fresh: 0, reused: 0 }, surprise_cause: ctx.wake.source },
  });

  const topology: ReconcilerTopology = {
    topology: {
      nodes: [{ node: asNodeId(NODE), contract_fingerprint: asFingerprint(CONTRACT_FP), wake_source: "external" }],
      edges: [],
      entry_points: [asNodeId(NODE)],
      acyclic: true,
    },
    contract_fingerprints: { [NODE]: asFingerprint(CONTRACT_FP) },
  };

  const dag = mountDag({
    topology,
    mounts: { [NODE]: { render: vendorRender, canonicalizer } },
  });

  // Cold-start ingest → render commits via the threaded compiled canonicalizer.
  const first = dag.ingest(NODE);
  equal(first[0]?.disposition, "rendered");

  // The receipt's fingerprint must be EXACTLY what the compiled canonicalizer
  // produces over the projected structured truth — proving the mount threaded
  // the compiled canonicalizer into commitPublished (architecture.md §5.2),
  // dropping the immaterial fetched_at rather than applying the atomic default.
  deepEqual(
    first[0]?.receipt?.fingerprints,
    compiled.apply(projectTruth(wm)),
    "mountDag committed via the threaded compiled canonicalizer",
  );

  // Cross-check: the atomic whole-truth default (folding in fetched_at) differs.
  const store2 = new InMemoryWorldModelStore();
  const wholeTruth = store2.commitPublished(NODE, wm); // atomicCanonicalizer default
  notEqual(
    first[0]?.receipt?.fingerprints[ATOMIC_FACET],
    wholeTruth.fingerprints[ATOMIC_FACET],
    "the mounted fingerprint is the compiled one, not the atomic whole-truth default",
  );
});
