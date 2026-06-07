// U7 (a) — the equal-correctness gate. The single most-named gaming trap is a
// cost-only row ("cost-gaming by under-rendering"). Every cost number must be
// paired with its accuracy against the oracle trajectory; a row missing a paired
// accuracy is a hard error, and a Reactor cost win is reportable ONLY where its
// correctness MATCHES the oracle-cron's.

"use strict";

/**
 * Pair each contestant's cost row with its correctness and gate it.
 * @param {object[]} rows  sweep rows (each has totalFresh + correctRate + correctnessOk)
 * @returns {{ gated: object[], oracleCorrect: object }}  throws if a row lacks paired accuracy
 */
function equalCorrectnessGate(rows) {
  // oracle-cron's correctness per lambda is the yardstick.
  const oracleByLambda = {};
  for (const r of rows) {
    if (r.contestant === "oracle-cron") oracleByLambda[r.lambda] = r.correctRate;
  }

  const gated = rows.map((r) => {
    if (typeof r.correctRate !== "number") {
      throw new Error(
        `equal-correctness gate: cost row for ${r.contestant}@lambda=${r.lambda} has no paired accuracy — refusing to emit a cost-only row.`,
      );
    }
    const oracle = oracleByLambda[r.lambda];
    const matchesOracle = oracle === undefined ? null : Math.abs(r.correctRate - oracle) < 1e-9;
    return {
      contestant: r.contestant,
      provenance: r.provenance,
      cost_confidence: r.cost_confidence,
      lambda: r.lambda,
      fresh: r.totalFresh,
      correct_rate: r.correctRate,
      matches_oracle_correctness: matchesOracle,
      cost_win_reportable: matchesOracle === true,
    };
  });

  return { gated, oracleByLambda };
}

module.exports = { equalCorrectnessGate };
