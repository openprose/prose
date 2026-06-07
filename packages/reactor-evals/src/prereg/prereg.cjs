// U5 — preregistration (labels + decision rule + baselines + model pin, hashed
// before any run). "A graph is not a result; a hypothesis that could have failed
// is." The surprise labels are content-hashed BEFORE any ledger write, or the
// regression is circular. The sweep reads the PRE-COMMITTED labels; it cannot
// define surprise from the trajectory it scores.

"use strict";

const crypto = require("node:crypto");
const { SURROGATE_SPEC } = require("../cost/deterministic-cost.cjs");

/**
 * Build the preregistration object from the generated cells (deterministic).
 * @param {object[]} cells          generateCell results (one per lambda)
 * @param {object[]} contestants
 * @param {object} cfg              { ticks, entities, nDependents, seed, modelPin }
 */
function buildPrereg(cells, contestants, cfg) {
  const labels = {};
  for (const cell of cells) {
    labels[String(cell.lambda)] = cell.labels.map((l) => ({
      tick: l.tick,
      materially_changed: l.materially_changed,
    }));
  }
  const prereg = {
    schema: "reactor-evals/prereg@1",
    hypothesis:
      "Reactor fresh-token spend per tick is driven by the PREREGISTERED material-change indicator, not by tick count (wall-clock/event-count).",
    null_hypothesis:
      "Per-tick fresh spend is independent of the material-change indicator (spend tracks wall-clock / event-count).",
    decision_rule: {
      test: "pooled per-tick OLS of fresh ~ materially_changed (0/1); slope = mean(fresh|material) - mean(fresh|immaterial)",
      significance: "seeded permutation test (10000 shuffles, mulberry32 seed=fixed) on |slope|; reject null at p < 0.01",
      headline_form:
        "At lambda=L, Reactor spends ~Nx fewer fresh tokens than an equal-correctness cron; its spend scales ~linearly through the origin with the change rate while the cron's stays flat.",
      equal_correctness_gate:
        "a cost row is reportable ONLY where the contestant's maintained-truth trajectory matches the oracle (== oracle-cron correctness).",
    },
    lambda_grid: cells.map((c) => c.lambda),
    ticks: cfg.ticks,
    entities: cfg.entities,
    n_dependents: cfg.nDependents,
    seed: cfg.seed,
    baselines: contestants.map((c) => ({ id: c.id, provenance: c.provenance })),
    model_pin: cfg.modelPin,
    cost_surrogate: SURROGATE_SPEC,
    poison_numbers_forbidden: ["46:46", "92:0", "256:0", "74:74", "0.00022823", "K1"],
    labels,
  };
  return prereg;
}

/** Stable hash over a canonicalized prereg (sorted keys), excluding nothing. */
function hashPrereg(prereg) {
  const canonical = stableStringify(prereg);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

module.exports = { buildPrereg, hashPrereg, stableStringify };
