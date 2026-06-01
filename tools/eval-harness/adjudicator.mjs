// adjudicator.mjs — the Verdict Adjudicator.
//
// Spec ("Verdict Adjudicator[example, scenario]"): combine the deterministic
// verdict, the judge verdicts, the consistency report, and a regression/cost
// comparison into a final ExampleScenarioVerdict. KEY RULE: deterministic
// blocking failures CAP the grade even if LLM judges like the output.
//
// Scoring frame mirrors the spec rubric (100 pts) but the harness's offline
// default has NO judge scores (passing-skipped), so the deterministic tier alone
// decides pass/fail and the grade is reported as "deterministic-only" (no letter
// inflation from absent judges). When judges ARE live, their scores fold in.
//
// "Performance" = cost vs a committed baseline rollup
// (createReplaySession costRollup.total.fresh). A quiet re-wake must spend
// fresh==0; a changed-input wake must spend fresh <= baseline*tolerance.

/**
 * @typedef {Object} ExampleScenarioVerdict
 * @property {string} exampleId
 * @property {string} scenarioId
 * @property {number} overallScore
 * @property {"A"|"B"|"C"|"D"|"F"} grade
 * @property {boolean} pass
 * @property {string[]} blockers
 * @property {string[]} warnings
 * @property {string[]} strongestEvidence
 * @property {string[]} topFixes
 * @property {string[]} judgeDisagreementNotes
 * @property {Object} performance
 * @property {boolean} judgesLive
 */

/**
 * @param {Object} args
 * @param {import("./normalizer.mjs").EvalTrajectory} args.trajectory
 * @param {import("./deterministic-checker.mjs").DeterministicVerdict} args.deterministic
 * @param {{verdicts:Object[],consistency:Object,enabled:boolean}} args.judgePanel
 * @param {Object} [args.scenario]
 * @param {{total:{fresh:number}}|null} [args.baselineRollup]  committed baseline cost rollup
 * @param {number} [args.tolerance]   fresh-cost tolerance multiplier (default 1.0)
 * @returns {ExampleScenarioVerdict}
 */
export function adjudicate({
  trajectory,
  deterministic,
  judgePanel,
  scenario = {},
  baselineRollup = null,
  tolerance = 1.0,
}) {
  const blockers = [];
  const warnings = [];
  const topFixes = [];
  const judgeDisagreementNotes = [];

  // ---- deterministic blockers cap the grade ------------------------------
  for (const c of deterministic.blockingFailures) {
    blockers.push(`${c.name}: ${c.actual}`);
    topFixes.push(`fix ${c.name} — expected ${c.expected}`);
  }
  for (const c of deterministic.fail.filter((x) => !x.blocking)) {
    warnings.push(`${c.name}: ${c.actual}`);
  }

  // ---- performance: cost vs committed baseline ---------------------------
  const performance = evaluatePerformance({
    trajectory,
    scenario,
    baselineRollup,
    tolerance,
  });
  if (!performance.passed) {
    // A cost regression is a warning by default (not a deterministic blocker),
    // unless it is a no_change_replay that spent fresh (that IS a blocker, and
    // the "unchanged replay skips" check already caught the moving part).
    if (scenario.kind === "no_change_replay" && performance.fresh > 0) {
      blockers.push(`no_change_replay spent fresh=${performance.fresh} (must be 0)`);
    } else {
      warnings.push(performance.note);
    }
  }

  // ---- judge folding (only when live) ------------------------------------
  const judgesLive = judgePanel.enabled === true;
  const liveVerdicts = judgePanel.verdicts.filter((v) => !v.skipped);
  let judgeScore = null;
  if (judgesLive && liveVerdicts.length > 0) {
    judgeScore =
      liveVerdicts.reduce((a, v) => a + v.score, 0) / liveVerdicts.length;
    const cons = judgePanel.consistency;
    if (cons && cons.needsAdjudication) {
      for (const c of cons.contradictions ?? []) judgeDisagreementNotes.push(c);
      for (const u of cons.unsupportedJudgeClaims ?? [])
        judgeDisagreementNotes.push(u);
      if ((cons.contradictions ?? []).length === 0)
        judgeDisagreementNotes.push(cons.note);
      // Disagreement is surfaced, NOT averaged away: do not silently smooth the
      // score — flag and cap confidence in the grade.
      warnings.push("judge disagreement flagged — see judgeDisagreementNotes");
    }
  }

  // ---- compose grade ------------------------------------------------------
  const detPassRatio =
    deterministic.checks.length === 0
      ? 1
      : deterministic.pass.length / deterministic.checks.length;

  // Base score: deterministic tier worth 60, judges worth 40 when live.
  let overallScore;
  if (judgesLive && judgeScore !== null) {
    overallScore = Math.round(detPassRatio * 60 + (judgeScore / 100) * 40);
  } else {
    // Offline default: the deterministic tier alone, scaled to 100 so the report
    // reads honestly ("deterministic-only"). Judges absent ≠ judges passed.
    overallScore = Math.round(detPassRatio * 100);
  }

  // Blockers cap the grade to F (auto-fail) regardless of score.
  const capped = blockers.length > 0;
  const grade = capped ? "F" : gradeFromScore(overallScore);
  const pass = !capped && deterministic.pass_;

  const strongestEvidence = collectStrongestEvidence(deterministic, liveVerdicts);

  return {
    exampleId: trajectory.exampleId,
    scenarioId: trajectory.scenarioId,
    overallScore: capped ? 0 : overallScore,
    grade,
    pass,
    blockers,
    warnings,
    strongestEvidence,
    topFixes,
    judgeDisagreementNotes,
    performance,
    judgesLive,
  };
}

function evaluatePerformance({ trajectory, scenario, baselineRollup, tolerance }) {
  const fresh = trajectory.costRollup.total.fresh;
  if (baselineRollup == null) {
    return {
      passed: true,
      fresh,
      baselineFresh: null,
      note: `no committed baseline; observed total.fresh=${fresh}`,
    };
  }
  const baselineFresh = baselineRollup.total.fresh;
  // Quiet re-wake (no_change_replay): the marquee invariant is fresh==0.
  if (scenario.kind === "no_change_replay") {
    return {
      passed: fresh === 0,
      fresh,
      baselineFresh,
      note: `no_change_replay fresh=${fresh} (must be 0)`,
    };
  }
  const limit = baselineFresh * tolerance;
  return {
    passed: fresh <= limit,
    fresh,
    baselineFresh,
    note: `total.fresh=${fresh} vs baseline*${tolerance}=${limit}`,
  };
}

function gradeFromScore(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function collectStrongestEvidence(deterministic, liveVerdicts) {
  const ev = [];
  for (const c of deterministic.pass.slice(0, 3)) {
    ev.push(`✓ ${c.name}: ${c.actual}`);
  }
  for (const v of liveVerdicts) {
    if (v.evidenceCitations.length > 0) {
      ev.push(`${v.dimension} cites ${v.evidenceCitations.slice(0, 2).join(", ")}`);
    }
  }
  return ev;
}
