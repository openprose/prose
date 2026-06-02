// Smoke test for the data layer: prove the SDK read surface flows through
// `buildSnapshot` into the wire payload the SPA consumes. Pure data — no FS, no
// model key (we hand `createReplaySession` a receipt array directly, the SDK's
// supported `{ receipts }` form).

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createReplaySession,
  ATOMIC_FACET,
  type LedgerReceipt,
} from "@openprose/reactor";
import {
  createReceipt,
  createNullSignature,
  type TopologyWorldModel,
} from "@openprose/reactor/internals";

import { buildSnapshot, type OpenedStateDir } from "./index";

function fp(hex: string): string {
  return "sha256:" + hex.padEnd(64, "0");
}

function renderedReceipt(): LedgerReceipt {
  return createReceipt({
    node: "alpha",
    contract_fingerprint: fp("a1"),
    wake: { source: "external", refs: [] },
    input_fingerprints: [],
    fingerprints: { [ATOMIC_FACET]: fp("b1"), funding: fp("c1") },
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: {
      provider: "openai",
      model: "gpt-x",
      tokens: { fresh: 100, reused: 0 },
      surprise_cause: "external",
    },
    sig: createNullSignature(),
  });
}

function skippedReceipt(): LedgerReceipt {
  return createReceipt({
    node: "beta",
    contract_fingerprint: fp("a2"),
    wake: { source: "input", refs: [] },
    input_fingerprints: [fp("b1")],
    fingerprints: { [ATOMIC_FACET]: fp("d2") },
    semantic_diff: {},
    prev: null,
    status: "skipped",
    cost: {
      provider: "none",
      model: "none",
      tokens: { fresh: 0, reused: 42 },
      surprise_cause: "input",
    },
    sig: createNullSignature(),
  });
}

const TOPOLOGY: TopologyWorldModel = {
  nodes: [
    { node: "alpha", contract_fingerprint: fp("a1"), wake_source: "external" },
    { node: "beta", contract_fingerprint: fp("a2"), wake_source: "input" },
  ],
  edges: [{ subscriber: "beta", producer: "alpha", facet: "funding" }],
  entry_points: ["alpha"],
  acyclic: true,
};

test("buildSnapshot projects receipts, topology, and cost rollup", () => {
  const receipts = [renderedReceipt(), skippedReceipt()];
  const session = createReplaySession({ receipts });
  const opened: OpenedStateDir = {
    stateDir: "/tmp/example",
    session,
    rawReceipts: receipts,
    topology: TOPOLOGY,
    worldModels: null,
    labels: {},
    beats: null,
  };

  const snap = buildSnapshot(opened);

  assert.equal(snap.hasTopology, true);
  assert.equal(snap.frames.length, 2);
  assert.equal(snap.nodes.length, 2);
  assert.equal(snap.edges.length, 1);
  assert.deepEqual(snap.entryPoints, ["alpha"]);

  const [f0, f1] = snap.frames;
  assert.equal(f0!.node, "alpha");
  assert.equal(f0!.status, "rendered");
  assert.equal(f0!.wakeSource, "external");
  assert.equal(f0!.cost.fresh, 100);
  // Cold start: every facet moved on the first receipt for the node.
  assert.ok(f0!.movedFacets.includes(ATOMIC_FACET));
  assert.ok(f0!.movedFacets.includes("funding"));

  assert.equal(f1!.node, "beta");
  assert.equal(f1!.status, "skipped");
  assert.equal(f1!.cost.reused, 42);

  const alpha = snap.nodes.find((n) => n.id === "alpha");
  assert.equal(alpha!.isEntryPoint, true);

  // alpha rendered and moved the `funding` facet → the alpha→beta `funding`
  // lane lights and beta is woken once. `@atomic` moved too but there is no
  // `@atomic` edge from alpha, so it lights no lane (strict facet match).
  assert.deepEqual(f0!.edgesToLight, [
    { producer: "alpha", subscriber: "beta", facet: "funding" },
  ]);
  assert.deepEqual(f0!.wokenSubscribers, ["beta"]);
  // beta was skipped → it lights no edges even though its own atomic "moved"
  // (cold start) — skipped/failed never propagate.
  assert.deepEqual(f1!.edgesToLight, []);
  assert.deepEqual(f1!.wokenSubscribers, []);
  // Each frame carries its node's world-model version (the @atomic fingerprint).
  assert.equal(f0!.atomicVersion, fp("b1"));

  // Cost rollup is bucketed by surprise_cause and totals the fresh/reused spend.
  assert.equal(snap.costRollup.total.fresh, 100);
  assert.equal(snap.costRollup.total.reused, 42);
  assert.equal(snap.costRollup.byCause["external"]!.fresh, 100);
  assert.equal(snap.costRollup.byCause["input"]!.reused, 42);
});

test("diamond single-wake: a node reached by ≥2 moved facets wakes once", () => {
  // producer publishes two facets (f1, f2); `sink` subscribes on BOTH, while
  // `only1` subscribes on f1 alone. A render that moves both facets must light
  // THREE lanes (sink←f1, sink←f2, only1←f1) but wake sink EXACTLY ONCE.
  const producer = createReceipt({
    node: "producer",
    contract_fingerprint: fp("e0"),
    wake: { source: "self", refs: [] },
    input_fingerprints: [],
    fingerprints: { [ATOMIC_FACET]: fp("e1"), f1: fp("f10"), f2: fp("f20") },
    semantic_diff: {},
    prev: null,
    status: "rendered",
    cost: {
      provider: "openai",
      model: "gpt-x",
      tokens: { fresh: 10, reused: 0 },
      surprise_cause: "self",
    },
    sig: createNullSignature(),
  });

  const topology: TopologyWorldModel = {
    nodes: [
      { node: "producer", contract_fingerprint: fp("e0"), wake_source: "self" },
      { node: "sink", contract_fingerprint: fp("e2"), wake_source: "input" },
      { node: "only1", contract_fingerprint: fp("e3"), wake_source: "input" },
    ],
    edges: [
      { subscriber: "sink", producer: "producer", facet: "f1" },
      { subscriber: "sink", producer: "producer", facet: "f2" },
      { subscriber: "only1", producer: "producer", facet: "f1" },
    ],
    entry_points: ["producer"],
    acyclic: true,
  };

  const session = createReplaySession({ receipts: [producer] });
  const snap = buildSnapshot({
    stateDir: "/tmp/d",
    session,
    rawReceipts: [producer],
    topology,
    worldModels: null,
    labels: {},
    beats: null,
  });
  const [frame] = snap.frames;

  // All three lanes light (per-facet selectivity, incl. both sink lanes).
  assert.equal(frame!.edgesToLight.length, 3);
  // But `sink` is woken ONCE — the diamond single-wake (dedupe like the reconciler).
  assert.deepEqual([...frame!.wokenSubscribers].sort(), ["only1", "sink"]);
  assert.equal(
    frame!.wokenSubscribers.filter((n) => n === "sink").length,
    1,
  );
});

test("buildSnapshot falls back to a node-only set without topology", () => {
  const receipts = [renderedReceipt()];
  const session = createReplaySession({ receipts });
  const snap = buildSnapshot({
    stateDir: "/tmp/x",
    session,
    rawReceipts: receipts,
    topology: null,
    worldModels: null,
    labels: {},
    beats: null,
  });

  assert.equal(snap.hasTopology, false);
  assert.deepEqual(
    snap.nodes.map((n) => n.id),
    ["alpha"],
  );
  assert.equal(snap.edges.length, 0);
});
