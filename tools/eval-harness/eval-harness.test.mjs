// eval-harness.test.mjs — the deterministic offline smoke (node:test, zero spend).
//
// RUN (offline, keyless):
//   REACTOR_OFFLINE=1 node --test tools/eval-harness/eval-harness.test.mjs
//
// Asserts the deterministic path runs OFFLINE against the shipped devtools
// fixtures (the masked-relay state-dir is the tarball-shipped fixture; monorepo-ci
// carries a `failed` receipt so blocked_or_gated is witnessed). NEVER touches the
// network: judgesEnabled() must be false under REACTOR_OFFLINE, and every judge
// body is passing-skipped.

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";

import { normalizeTrajectory } from "./normalizer.mjs";
import { runDeterministicChecks } from "./deterministic-checker.mjs";
import { deriveScenarios, SCENARIO_KINDS } from "./scenarios.mjs";
import { runJudgePanel, judgesEnabled } from "./judge-panel.mjs";
import { adjudicate } from "./adjudicator.mjs";
import { runEval } from "./index.mjs";
import { renderMarkdown, reportContentHash } from "./report.mjs";
import { REPO_ROOT } from "./resolve.mjs";

const fx = (n) => join(REPO_ROOT, "packages", "reactor-devtools", "fixtures", n);
const MASKED_RELAY = fx("masked-relay");
const MONOREPO_CI = fx("monorepo-ci");

// Force offline for the whole file so no test can dial out, even with a key on disk.
process.env["REACTOR_OFFLINE"] = "1";

test("judges are OFF under REACTOR_OFFLINE (no key path, never dials out)", () => {
  assert.equal(judgesEnabled(), false);
});

test("normalizer produces a runtime-independent EvalTrajectory from a state-dir", () => {
  const t = normalizeTrajectory({
    stateDir: MASKED_RELAY,
    exampleId: "masked-relay",
    scenarioId: "cold_start",
  });
  assert.ok(t.events.length > 0, "has events");
  assert.ok(t.hasTopology, "loaded topology");
  assert.ok(t.acyclic, "acyclic");
  assert.ok(t.renderEvents.length > 0 && t.skipEvents.length > 0, "render+skip events");
  assert.ok(t.costRollup.total.fresh >= 0, "cost rollup present");
  // every event carries the normalized shape
  for (const e of t.events) {
    assert.ok(typeof e.node === "string");
    assert.ok(["rendered", "skipped", "failed", "coalesced"].includes(e.status));
    assert.ok(["input", "self", "external"].includes(e.wakeSource));
    assert.ok(Array.isArray(e.movedFacets));
    assert.ok(typeof e.cost.fresh === "number");
  }
  assert.ok(t.trajectoryHash.startsWith("sha256:"));
});

test("trajectory hash is byte-stable across re-normalization (determinism)", () => {
  const a = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "x", scenarioId: "s" });
  const b = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "x", scenarioId: "s" });
  assert.equal(a.trajectoryHash, b.trajectoryHash);
});

test("deterministic checker passes the clean masked-relay fixture (no blockers)", () => {
  const t = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "masked-relay", scenarioId: "cold_start" });
  const det = runDeterministicChecks({ trajectory: t, scenario: { kind: "cold_start" } });
  assert.equal(det.blockingFailures.length, 0, "no deterministic blockers");
  assert.equal(det.pass_, true, "all checks pass");
  const names = det.checks.map((c) => c.name);
  // the spec checks are all present
  for (const expected of [
    "required-top-level-artifacts-exist",
    "receipts-cite-changed-upstream-inputs",
    "unchanged-replay-skips-expensive-renders",
    "human-gates-not-bypassed",
    "no-same-epoch-cycle",
    "no-errored-run-marked-passing",
    "chain-verify",
  ]) {
    assert.ok(names.includes(expected), `check present: ${expected}`);
  }
});

test("scenario derivation: masked-relay witnesses cold/changed/replay/artifact, skips blocked", () => {
  const t = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "masked-relay", scenarioId: "_" });
  const scen = deriveScenarios(t);
  assert.equal(scen.length, SCENARIO_KINDS.length);
  const supported = scen.filter((s) => s.supported).map((s) => s.kind);
  assert.ok(supported.includes("cold_start"));
  assert.ok(supported.includes("no_change_replay"));
  assert.ok(supported.includes("artifact_review"));
  const blocked = scen.find((s) => s.kind === "blocked_or_gated");
  assert.equal(blocked.supported, false, "no failed step → blocked_or_gated skipped with reason");
  assert.ok(blocked.skipReason);
});

test("monorepo-ci (has a failed receipt) witnesses blocked_or_gated and isolates the failure", () => {
  const t = normalizeTrajectory({ stateDir: MONOREPO_CI, exampleId: "monorepo-ci", scenarioId: "_" });
  assert.ok(t.failedEvents.length > 0, "fixture has a failed receipt");
  const det = runDeterministicChecks({ trajectory: t, scenario: { kind: "blocked_or_gated" } });
  const isolation = det.checks.find((c) => c.name === "no-errored-run-marked-passing");
  assert.equal(isolation.passed, true, "failed receipt: 0 fresh, 0 downstream wake");
  assert.equal(det.blockingFailures.length, 0);
});

test("judge panel is passing-skipped offline (no network, all 5 dimensions)", async () => {
  const t = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "masked-relay", scenarioId: "cold_start" });
  const det = runDeterministicChecks({ trajectory: t, scenario: { kind: "cold_start" } });
  const panel = await runJudgePanel({ trajectory: t, deterministic: det, scenario: { kind: "cold_start" } });
  assert.equal(panel.enabled, false);
  assert.equal(panel.verdicts.length, 5);
  for (const v of panel.verdicts) {
    assert.equal(v.skipped, true, `${v.dimension} skipped`);
  }
  assert.equal(panel.consistency.skipped, true);
});

test("adjudicator: deterministic blocking failure CAPS the grade to F", () => {
  const t = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "masked-relay", scenarioId: "cold_start" });
  // Force a blocking failure by requiring an artifact that does not exist.
  const det = runDeterministicChecks({
    trajectory: t,
    scenario: { kind: "cold_start" },
    requiredArtifacts: ["nonexistent.node.id"],
  });
  assert.ok(det.blockingFailures.length > 0);
  const v = adjudicate({
    trajectory: t,
    deterministic: det,
    judgePanel: { enabled: false, verdicts: [], consistency: {} },
    scenario: { kind: "cold_start" },
  });
  assert.equal(v.grade, "F");
  assert.equal(v.pass, false);
  assert.equal(v.overallScore, 0);
  assert.ok(v.blockers.length > 0);
});

test("performance: no_change_replay with fresh>0 vs baseline becomes a blocker", () => {
  const t = normalizeTrajectory({ stateDir: MASKED_RELAY, exampleId: "masked-relay", scenarioId: "no_change_replay" });
  // masked-relay's whole trajectory has fresh>0 (it includes cold renders); the
  // no_change_replay performance gate (fresh must be 0) therefore blocks here —
  // exactly the "unchanged replay must be free" invariant, asserted off the rollup.
  const det = runDeterministicChecks({ trajectory: t, scenario: { kind: "no_change_replay" } });
  const v = adjudicate({
    trajectory: t,
    deterministic: det,
    judgePanel: { enabled: false, verdicts: [], consistency: {} },
    scenario: { kind: "no_change_replay" },
    baselineRollup: { total: { fresh: 0 } },
  });
  assert.equal(v.performance.passed, false);
  assert.ok(v.blockers.some((b) => b.includes("no_change_replay")));
  assert.equal(v.grade, "F");
});

test("end-to-end runEval over fixtures: report is byte-stable and deterministic-only", async () => {
  const examples = [
    { exampleId: "masked-relay", stateDir: MASKED_RELAY },
    { exampleId: "monorepo-ci", stateDir: MONOREPO_CI },
  ];
  const a = await runEval({ runId: "A", harnessBuildId: "test", examples });
  const b = await runEval({ runId: "B", harnessBuildId: "test", examples });
  assert.equal(a.report.mode, "deterministic-only");
  assert.equal(a.report.judgesEnabled, false);
  assert.ok(a.report.summary.total >= 8, "ran multiple scenarios");
  // content hash excludes runId/timestamps → stable across runs
  assert.equal(reportContentHash(a.report), reportContentHash(b.report));
  const md = renderMarkdown(a.report);
  assert.ok(md.includes("# Reactor Eval Report"));
  assert.ok(md.includes("deterministic-only"));
  assert.ok(md.includes("Trajectory hashes"));
});
