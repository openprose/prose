"use strict";
const { test } = require("node:test");
const assert = require("node:assert");

const { deterministicCost, SURROGATE_SPEC } = require("../src/cost/deterministic-cost.cjs");
const { generateCell } = require("../src/world/generator.cjs");
const { CONTESTANTS } = require("../src/baselines/contestants.cjs");
const { runContestant } = require("../src/run/sweep.cjs");
const { buildPrereg, hashPrereg } = require("../src/prereg/prereg.cjs");
const { surpriseCostRegression, propagation } = require("../src/score/scorers.cjs");
const { equalCorrectnessGate } = require("../src/score/frontier.cjs");
const { validateMatrix } = require("../src/report/matrix.cjs");
const { duplicateIdempotency, crashRecovery } = require("../src/invariants/invariants.cjs");

const ctx = { wake: { source: "input" } };

test("U1: deterministicCost is valid, monotone, and pure", () => {
  const a = deterministicCost(ctx, { upstreamBytes: 100, outputBytes: 40, workWeight: 1 });
  assert.equal(a.surprise_cause, "input");
  assert.ok(Number.isSafeInteger(a.tokens.fresh) && a.tokens.fresh >= 0);
  const b = deterministicCost(ctx, { upstreamBytes: 200, outputBytes: 40, workWeight: 1 });
  assert.ok(b.tokens.fresh > a.tokens.fresh, "monotone in bytes");
  const c = deterministicCost(ctx, { upstreamBytes: 100, outputBytes: 40, workWeight: 1 });
  assert.equal(a.tokens.fresh, c.tokens.fresh, "pure");
  const mech = deterministicCost(ctx, { upstreamBytes: 100, outputBytes: 40, workWeight: 0 });
  assert.equal(mech.tokens.fresh, 0, "mechanical gateway = 0 fresh");
  assert.equal(SURROGATE_SPEC.chars_per_token, 4);
});

test("U2: generator is byte-stable at fixed seed; lambda controls material count", () => {
  const c1 = generateCell({ lambda: 0.1, ticks: 500, entities: 1, seed: 1 });
  const c2 = generateCell({ lambda: 0.1, ticks: 500, entities: 1, seed: 1 });
  assert.deepEqual(c1.labels, c2.labels, "stable");
  const lo = generateCell({ lambda: 0.0, ticks: 500, entities: 1, seed: 1 });
  const hi = generateCell({ lambda: 1.0, ticks: 500, entities: 1, seed: 1 });
  // lambda=0 -> exactly the cold-start bootstrap is "material" (1), then all-skip.
  assert.equal(lo.materialCount, 1, "lambda=0 -> bootstrap only");
  assert.ok(hi.materialCount > lo.materialCount);
});

test("U3: reactor skips immaterial ticks; cron renders every tick; equal-correctness", () => {
  const cell = generateCell({ lambda: 0.1, ticks: 500, entities: 1, seed: 7 });
  const reactor = runContestant(CONTESTANTS.find((c) => c.id === "reactor"), cell, { nDependents: 3 });
  const cron = runContestant(CONTESTANTS.find((c) => c.id === "oracle-cron"), cell, { nDependents: 3 });
  assert.ok(reactor.totalFresh < cron.totalFresh, "reactor cheaper");
  assert.ok(reactor.dispositions.skipped > 0, "reactor skips");
  assert.equal(reactor.correctnessOk, true, "reactor equal-correctness");
  assert.equal(cron.correctnessOk, true, "cron correct");
});

test("U5: prereg hash is stable and tamper-sensitive", () => {
  const cells = [generateCell({ lambda: 0.1, ticks: 100, entities: 1, seed: 3 })];
  const p1 = buildPrereg(cells, CONTESTANTS, { ticks: 100, entities: 1, nDependents: 3, seed: 3, modelPin: "x" });
  const h1 = hashPrereg(p1);
  const h2 = hashPrereg(buildPrereg(cells, CONTESTANTS, { ticks: 100, entities: 1, nDependents: 3, seed: 3, modelPin: "x" }));
  assert.equal(h1, h2, "stable");
  p1.labels["0.1"][0].materially_changed = !p1.labels["0.1"][0].materially_changed;
  assert.notEqual(h1, hashPrereg(p1), "tamper changes hash");
});

test("U6: regression rejects the null for reactor; propagation exact", () => {
  const cell = generateCell({ lambda: 0.1, ticks: 1000, entities: 1, seed: 9 });
  const labels = cell.labels.map((l) => ({ tick: l.tick, materially_changed: l.materially_changed }));
  const reactor = runContestant(CONTESTANTS.find((c) => c.id === "reactor"), cell, { nDependents: 3 });
  const reg = surpriseCostRegression(reactor.perTick, labels);
  assert.equal(reg.rejects_null, true, "reactor rejects null");
  assert.ok(reg.slope_fresh_per_material_tick > 0);
  const prop = propagation(reactor.perTick, labels);
  assert.equal(prop.exact, true, "wake precision+recall exact");
});

test("U6: cron does NOT reject the surprise null (its spend tracks time)", () => {
  const cell = generateCell({ lambda: 0.1, ticks: 1000, entities: 1, seed: 11 });
  const labels = cell.labels.map((l) => ({ tick: l.tick, materially_changed: l.materially_changed }));
  const cron = runContestant(CONTESTANTS.find((c) => c.id === "oracle-cron"), cell, { nDependents: 3 });
  const reg = surpriseCostRegression(cron.perTick, labels);
  // cron renders every tick regardless of materiality -> slope ~ 0 -> does not reject.
  assert.equal(reg.rejects_null, false, "cron spend independent of surprise");
});

test("U7: equal-correctness gate throws on a cost-only row; matrix valid", () => {
  validateMatrix();
  assert.throws(() => equalCorrectnessGate([{ contestant: "x", lambda: 0.1, totalFresh: 5 }]), /no paired accuracy/);
});

test("U9: duplicate-idempotency and crash-recovery invariants hold", () => {
  assert.equal(duplicateIdempotency().ok, true);
  assert.equal(crashRecovery().ok, true);
});
