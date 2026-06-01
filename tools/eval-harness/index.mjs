// index.mjs — the eval-harness orchestration entry: runEval().
//
// Pipeline (spec topology, collapsed for the offline/fixture path):
//   state-dir → Trajectory Normalizer → Deterministic Checker → (Judge Panel,
//   key-gated) → Verdict Adjudicator → EvalReport (+ Markdown writer).
//
// One call evaluates ONE example across the requested scenarios over a committed
// replay/ state-dir. The judge path is OFF unless a key is resolvable AND
// REACTOR_OFFLINE is unset (judgesEnabled). Everything below the normalizer
// shares one canonical EvalTrajectory object (spec: judges and checks see the
// same normalized trace).

import { normalizeTrajectory } from "./normalizer.mjs";
import { runDeterministicChecks } from "./deterministic-checker.mjs";
import { deriveScenarios } from "./scenarios.mjs";
import { runJudgePanel, judgesEnabled } from "./judge-panel.mjs";
import { adjudicate } from "./adjudicator.mjs";
import { buildEvalReport } from "./report.mjs";
import { DEFAULT_ENV_PATH } from "./resolve.mjs";

/**
 * Evaluate one example over its committed state-dir.
 *
 * @param {Object} args
 * @param {string} args.exampleId
 * @param {string} args.stateDir            absolute path to the committed replay/ state-dir
 * @param {string[]} [args.scenarios]       scenario kinds to run (default: all 5)
 * @param {string[]} [args.requiredArtifacts]
 * @param {string[]} [args.gatedNodes]      nodes behind a human/safety gate (blocked_or_gated)
 * @param {string[]} [args.maintainsPostconditions]  the ### Maintains rubric (judge reliability)
 * @param {{total:{fresh:number}}|null} [args.baselineRollup]
 * @param {number} [args.tolerance]
 * @param {string} [args.envPath]
 * @returns {Promise<{results:Object[],skipped:string[],judgesEnabled:boolean}>}
 */
export async function evaluateExample({
  exampleId,
  stateDir,
  scenarios,
  requiredArtifacts = [],
  gatedNodes = [],
  maintainsPostconditions = [],
  baselineRollup = null,
  tolerance = 1.0,
  envPath = DEFAULT_ENV_PATH,
}) {
  // Normalize ONCE (the canonical trajectory the whole example shares); each
  // scenario re-uses it with its own scenario context + scenarioId.
  const baseTraj = normalizeTrajectory({
    stateDir,
    exampleId,
    scenarioId: "_base",
  });
  const scenarioCtxs = deriveScenarios(baseTraj, {
    only: scenarios,
    gatedNodes,
  });

  const results = [];
  const skipped = [];
  for (const ctx of scenarioCtxs) {
    if (!ctx.supported) {
      skipped.push(
        `${exampleId}/${ctx.kind}: ${ctx.skipReason ?? "not witnessed by this state-dir"}`,
      );
      continue;
    }
    const trajectory = {
      ...baseTraj,
      scenarioId: ctx.scenarioId,
      trajectoryHash: baseTraj.trajectoryHash, // same bytes → same hash
    };
    const deterministic = runDeterministicChecks({
      trajectory,
      scenario: ctx,
      requiredArtifacts,
    });
    const judgePanel = await runJudgePanel({
      trajectory,
      deterministic,
      scenario: ctx,
      maintainsPostconditions,
      envPath,
    });
    const verdict = adjudicate({
      trajectory,
      deterministic,
      judgePanel,
      scenario: ctx,
      baselineRollup,
      tolerance,
    });
    results.push({ trajectory, deterministic, judgePanel, verdict });
  }

  return { results, skipped, judgesEnabled: judgesEnabled(envPath) };
}

/**
 * Run a full eval over many examples and synthesize the EvalReport.
 *
 * @param {Object} args
 * @param {string} [args.runId]
 * @param {string} [args.harnessBuildId]
 * @param {{exampleId:string,stateDir:string,scenarios?:string[],requiredArtifacts?:string[],gatedNodes?:string[],maintainsPostconditions?:string[],baselineRollup?:Object|null,tolerance?:number}[]} args.examples
 * @param {string} [args.envPath]
 * @returns {Promise<{report:Object,results:Object[]}>}
 */
export async function runEval({
  runId = `run-${stableRunStamp()}`,
  harnessBuildId = "local",
  examples,
  envPath = DEFAULT_ENV_PATH,
}) {
  const allResults = [];
  const allSkipped = [];
  let judgesOn = false;
  for (const ex of examples) {
    const { results, skipped, judgesEnabled: on } = await evaluateExample({
      ...ex,
      envPath,
    });
    judgesOn = judgesOn || on;
    allResults.push(...results);
    allSkipped.push(...skipped);
  }
  const report = buildEvalReport({
    runId,
    harnessBuildId,
    results: allResults,
    judgesEnabled: judgesOn,
    skipped: allSkipped,
  });
  return { report, results: allResults };
}

/** A stable-ish run stamp; the report content hash deliberately excludes it. */
function stableRunStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export { normalizeTrajectory } from "./normalizer.mjs";
export { runDeterministicChecks } from "./deterministic-checker.mjs";
export { deriveScenarios, SCENARIO_KINDS } from "./scenarios.mjs";
export { runJudgePanel, judgesEnabled, JUDGE_DIMENSIONS } from "./judge-panel.mjs";
export { adjudicate } from "./adjudicator.mjs";
export {
  buildEvalReport,
  renderMarkdown,
  writeReport,
  reportContentHash,
} from "./report.mjs";
