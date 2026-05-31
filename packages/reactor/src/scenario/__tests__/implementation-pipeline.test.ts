// IT-3 — Implementation Pipeline, scaled (the fs/shell + subagent stress test).
// Source: tests/implementation-pipeline.md; INTEGRATION-TESTS-PLAN.md §3 IT-3.
//
// The OFFLINE layer (this file) drives the ~12-node implementation-pipeline topology
// through the REAL reconciler with DETERMINISTIC FAKE renders — zero model calls —
// and is the green bar that gates the commit. Its live sibling
// (`implementation-pipeline.live.test.ts`) boots the SAME shapes with real renders
// that WRITE real patch files via fs_write and run shell_exec in per-node working
// dirs, the harness HARVESTS the directory → commits → fingerprints (Option-B).
//
//   Planning Docs + Target Repo (gateways) → Corpus → Work Plan (facets a/b/c)
//     → Foundation → 3 Lanes (each ⊂ its facet + foundation) → Construction Review
//     → Integration Builder → Verification Runner → Implementation Report
//
// The assertions cover IT-3's distinctive mechanics:
//   - facet lane isolation: a lane wakes only when ITS facet or the foundation moves;
//     an unchanged lane emits a cheap SKIP receipt.
//   - foundation fanout: a shared-shape change wakes ALL three lanes in one wave.
//   - diamond fan-in: Construction Review (over 3 lanes) and Verification Runner
//     reconverge to a SINGLE render for their fan-in tuple.
//   - restart-skip: a no-change re-run boots to all-skips.
//   - fixed topology: the work planner cannot mount a seventh lane (extra work is
//     recorded as `unassigned_work`, not a new node).

import { deepEqual, equal, ok } from "node:assert/strict";
import { test } from "node:test";

import {
  CONSTRUCTION_REVIEW,
  CORPUS,
  FACET_A,
  FACET_B,
  FACET_C,
  FOUNDATION,
  FOUNDATION_FACET,
  IMPLEMENTATION_REPORT,
  INTEGRATION_BUILDER,
  LANE_A,
  LANE_B,
  LANE_C,
  LANES,
  PLANNING_GATEWAY,
  REPO_GATEWAY,
  VERIFICATION_RUNNER,
  WORK_PLAN,
  moveLaneFacet,
  moveSharedShape,
  pipelineScenario,
  readJson,
  reRunUnchanged,
  runPipeline,
} from "../implementation-pipeline";
import {
  countDisposition,
  dispositionOf,
  facetFingerprint,
  lastReceipt,
  woke,
} from "../trace";

const ALL_NODES = [
  PLANNING_GATEWAY,
  REPO_GATEWAY,
  CORPUS,
  WORK_PLAN,
  FOUNDATION,
  ...LANES,
  CONSTRUCTION_REVIEW,
  INTEGRATION_BUILDER,
  VERIFICATION_RUNNER,
  IMPLEMENTATION_REPORT,
];

// ---------------------------------------------------------------------------
// Inventory — the fixed topology mounted as specified
// ---------------------------------------------------------------------------

test("IT-3 inventory: ~12 nodes, two gateway entry points, acyclic; the 3 lanes are present", () => {
  const scn = pipelineScenario();
  const nodeIds = scn.topology.topology.nodes.map((n) => n.node);
  // 2 gateways + corpus + work-plan + foundation + 3 lanes + review + integration
  // + verification + report = 12.
  equal(nodeIds.length, 12);
  deepEqual(
    scn.topology.topology.entry_points.slice().sort(),
    [PLANNING_GATEWAY, REPO_GATEWAY].sort(),
  );
  equal(scn.topology.topology.acyclic, true);
  for (const lane of LANES) {
    ok(nodeIds.includes(lane), `lane ${lane} must be mounted`);
  }
});

// ---------------------------------------------------------------------------
// Cold cascade — the whole pipeline boots
// ---------------------------------------------------------------------------

test("IT-3 cold cascade: every node renders; same-depth nodes render once; the report commits a passing status", () => {
  const scn = pipelineScenario();
  const r = runPipeline(scn);

  // Every node renders at least once on the cold cascade.
  for (const n of ALL_NODES) {
    ok(
      countDisposition(r, n, "rendered") >= 1,
      `${n} must render at least once on the cold cascade`,
    );
  }
  // The upstream spine + the same-depth nodes render EXACTLY once (the two gateways
  // are seeded in one drain, so the Corpus's two-gateway fan-in coalesces to a
  // single Corpus/Work-Plan/Foundation render — not once-per-gateway).
  for (const n of [
    PLANNING_GATEWAY,
    REPO_GATEWAY,
    CORPUS,
    WORK_PLAN,
    FOUNDATION,
    ...LANES,
  ]) {
    equal(
      countDisposition(r, n, "rendered"),
      1,
      `${n} must render exactly once on the cold cascade (coalesced fan-in)`,
    );
  }
  // (Construction Review / Integration / Verification / Report are CROSS-DEPTH
  // fan-ins — woken by successive waves — so they may render more than once across
  // the cascade; their single-wake guarantee is asserted in the diamond test, which
  // moves a SINGLE same-depth wave.)
  const report = readJson(scn.store, IMPLEMENTATION_REPORT);
  equal(report?.["status"], "passed", "the report must commit a passing status");
});

// ---------------------------------------------------------------------------
// Fixed topology — a seventh lane cannot be created; extra work is recorded
// ---------------------------------------------------------------------------

test("IT-3 fixed topology: extra work for an unknown lane becomes `unassigned_work`, NOT a new node", () => {
  const scn = pipelineScenario();
  // Add a work item assigned to a lane that does NOT exist in the fixed topology.
  scn.deps.planning = {
    ...scn.deps.planning,
    items: [
      ...scn.deps.planning.items,
      { id: "w99", lane: "responsibility.lane-ghost", goal: "rogue lane" },
    ],
  };
  runPipeline(scn);

  // The topology still has exactly the declared nodes — no seventh/ghost lane.
  const nodeIds = scn.topology.topology.nodes.map((n) => n.node);
  equal(nodeIds.length, 12);
  ok(!nodeIds.includes("responsibility.lane-ghost"));

  // The rogue work surfaced as `unassigned_work` in the work plan, not a node.
  const plan = readJson(scn.store, WORK_PLAN);
  const unassigned = (plan?.["unassigned_work"] ?? []) as { id: string }[];
  ok(
    unassigned.some((u) => u.id === "w99"),
    "the rogue work item must be recorded as unassigned_work",
  );
});

// ---------------------------------------------------------------------------
// Facet lane isolation — a lane wakes ONLY when its facet moves
// ---------------------------------------------------------------------------

test("IT-3 facet lane isolation: moving ONE lane's work-plan facet wakes ONLY that lane; the others SKIP", () => {
  const scn = pipelineScenario();
  runPipeline(scn); // cold cascade

  const beforeA = facetFingerprint(scn.ledger, WORK_PLAN, FACET_A);
  const beforeB = facetFingerprint(scn.ledger, WORK_PLAN, FACET_B);
  const beforeC = facetFingerprint(scn.ledger, WORK_PLAN, FACET_C);
  const beforeFoundation = facetFingerprint(scn.ledger, FOUNDATION, FOUNDATION_FACET);

  // Move ONLY Lane B's facet (append a Lane-B work item).
  const r = moveLaneFacet(scn, LANE_B);

  // Precondition: only facet_b moved; facet_a / facet_c / foundation are unchanged.
  equal(facetFingerprint(scn.ledger, WORK_PLAN, FACET_A), beforeA, "facet_a unmoved");
  equal(facetFingerprint(scn.ledger, WORK_PLAN, FACET_C), beforeC, "facet_c unmoved");
  equal(
    facetFingerprint(scn.ledger, FOUNDATION, FOUNDATION_FACET),
    beforeFoundation,
    "the foundation facet unmoved",
  );
  ok(
    facetFingerprint(scn.ledger, WORK_PLAN, FACET_B) !== beforeB,
    "facet_b must move (the moved lane's facet)",
  );

  // Only Lane B re-rendered; Lane A and Lane C did NOT wake (lane isolation).
  equal(countDisposition(r, LANE_B, "rendered"), 1, "Lane B must re-render");
  ok(!woke(r, LANE_A), "Lane A must NOT wake (its facet is unmoved)");
  ok(!woke(r, LANE_C), "Lane C must NOT wake (its facet is unmoved)");

  // The downstream convergence nodes wake because a lane output moved.
  ok(woke(r, CONSTRUCTION_REVIEW), "Construction Review wakes (a lane moved)");
  ok(woke(r, INTEGRATION_BUILDER), "Integration Builder wakes");
  ok(woke(r, VERIFICATION_RUNNER), "Verification Runner wakes");
  ok(woke(r, IMPLEMENTATION_REPORT), "Implementation Report wakes");
});

// ---------------------------------------------------------------------------
// Foundation fanout — a shared-shape change wakes ALL lanes
// ---------------------------------------------------------------------------

test("IT-3 foundation fanout: moving the shared shape wakes ALL three lanes in one wave", () => {
  const scn = pipelineScenario();
  runPipeline(scn); // cold cascade

  const beforeFoundation = facetFingerprint(scn.ledger, FOUNDATION, FOUNDATION_FACET);

  const r = moveSharedShape(scn);

  ok(
    facetFingerprint(scn.ledger, FOUNDATION, FOUNDATION_FACET) !== beforeFoundation,
    "the foundation facet must move (the shared shape changed)",
  );
  // ALL three lanes wake + re-render (they all subscribe to the foundation facet).
  for (const lane of LANES) {
    equal(
      countDisposition(r, lane, "rendered"),
      1,
      `${lane} must re-render on a foundation change`,
    );
  }
});

// ---------------------------------------------------------------------------
// Diamond fan-in — single wake at Construction Review + Verification Runner
// ---------------------------------------------------------------------------

test("IT-3 diamond fan-in: Construction Review renders ONCE for the same-depth 3-lane fan-in", () => {
  const scn = pipelineScenario();
  runPipeline(scn); // cold cascade

  // A foundation change moves all three lanes in ONE same-depth wave; Construction
  // Review (⊂ all three lanes, same depth) reconverges to a SINGLE render, not
  // one-per-lane (the three same-depth lane wakes coalesce into one fan-in tuple).
  const r = moveSharedShape(scn);

  equal(
    countDisposition(r, CONSTRUCTION_REVIEW, "rendered"),
    1,
    "Construction Review must render exactly once for the 3-lane fan-in tuple",
  );
  // Construction Review consumed all three lanes + the foundation (4 inbound edges).
  const rec = lastReceipt(scn.ledger, CONSTRUCTION_REVIEW);
  ok(rec);
  equal(
    rec.input_fingerprints.length,
    LANES.length + 1,
    "Construction Review must consume its 3-lane + foundation inbound tuple",
  );
});

test("IT-3 verification single-wake: a lane edit propagates through Integration to Verification, which renders ONCE for its single moved input", () => {
  const scn = pipelineScenario();
  runPipeline(scn); // cold cascade

  // Move ONE lane's work — its patch body changes, so the integrated patch set moves
  // (Integration Builder carries the merged bodies), which wakes Verification Runner
  // for its single (Integration) moved input. This proves the full
  // lane→review→integration→verification chain propagates AND that the linear
  // convergence node renders exactly once for its single inbound move.
  const r = moveLaneFacet(scn, LANE_A);

  ok(woke(r, INTEGRATION_BUILDER), "Integration Builder must wake on a lane edit");
  equal(
    countDisposition(r, VERIFICATION_RUNNER, "rendered"),
    1,
    "Verification Runner must render exactly once for its single moved input",
  );
  // Verification consumed exactly its one inbound (Integration) fingerprint.
  const rec = lastReceipt(scn.ledger, VERIFICATION_RUNNER);
  ok(rec);
  equal(
    rec.input_fingerprints.length,
    1,
    "Verification Runner must consume exactly its single Integration fingerprint",
  );
});

// ---------------------------------------------------------------------------
// Restart / no-change replay — boots to all-skips
// ---------------------------------------------------------------------------

test("IT-3 restart-skip: a no-change re-run skips BOTH gateways, nothing downstream wakes, zero new renders", () => {
  const scn = pipelineScenario();
  runPipeline(scn); // cold cascade

  const rendersBefore = { ...scn.deps.renders };
  const again = reRunUnchanged(scn);

  // Both gateways memo-skip on unmoved ingress facets.
  equal(dispositionOf(again, PLANNING_GATEWAY), "skipped", "planning gateway skips");
  equal(dispositionOf(again, REPO_GATEWAY), "skipped", "repo gateway skips");
  // A skip propagates nothing — no downstream node wakes at all.
  for (const n of ALL_NODES) {
    if (n === PLANNING_GATEWAY || n === REPO_GATEWAY) continue;
    ok(!woke(again, n), `${n} must not wake on a no-change re-run`);
  }
  // Zero new renders anywhere (the render bodies never ran).
  deepEqual(scn.deps.renders, rendersBefore);
});

test("IT-3 deterministic replay: two identical pipeline runs ⇒ identical world-model fingerprints", () => {
  const run = () => {
    const scn = pipelineScenario();
    runPipeline(scn);
    return ALL_NODES.map((n) => [
      n,
      lastReceipt(scn.ledger, n)?.fingerprints["@atomic"],
    ]);
  };
  deepEqual(run(), run());
});
