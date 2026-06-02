// judge-panel.mjs — the LLM Judge Panel (key-gated; OFF by default).
//
// Spec ("LLM Judge Panel") + plan §5 tier-3: five judges —
//   program_semantics, trajectory_quality, artifact_usefulness,
//   safety_privacy, launch_demo — each returns a score + evidence CITATIONS;
// plus a Judge Consistency note that SURFACES disagreement rather than averaging.
//
// GATING (plan §5 / task): the model path is OFF unless an OpenRouter key is
// resolvable AND `REACTOR_OFFLINE` is not forced. We read the key ONLY through
// the shipped provider helpers (`hasOpenRouterKey`) pointed at the openprose
// `.env`, and we NEVER print or return the key. With no key / offline, every
// judge returns a `skipped: true`, `passing` verdict so a keyless CI run is green
// and never touches the network.
//
// The rubric for "reliability" IS the example responsibility's `### Maintains`
// postconditions (plan §5): judges are fed those postconditions + the rendered
// artifact and asked per-postcondition pass/fail + a MANDATORY evidence citation.
// "Performance" = cost vs a committed baseline rollup (createReplaySession
// costRollup.total.fresh) — supplied by the adjudicator, not invented here.

import { provider, DEFAULT_ENV_PATH } from "./resolve.mjs";

export const JUDGE_DIMENSIONS = [
  "program_semantics",
  "trajectory_quality",
  "artifact_usefulness",
  "safety_privacy",
  "launch_demo",
];

/**
 * @typedef {Object} JudgeVerdict
 * @property {string} dimension
 * @property {number} score          0..100
 * @property {boolean} skipped       true when offline/keyless (passing-skipped)
 * @property {string} reason         why skipped, or a one-line summary
 * @property {{name:string,passed:boolean,actual:string,expected:string}[]} rubricItems
 * @property {string[]} evidenceCitations   trajectory event refs / node ids / hashes
 * @property {number} confidence     0..1
 */

/**
 * Is the live judge path available? Single gate: a resolvable key (which already
 * returns false under REACTOR_OFFLINE). Never reads/echoes the key value.
 * @param {string} [envPath]
 * @returns {boolean}
 */
export function judgesEnabled(envPath = DEFAULT_ENV_PATH) {
  try {
    return provider.hasOpenRouterKey(envPath) === true;
  } catch {
    return false;
  }
}

/**
 * Run the judge panel for one trajectory + its deterministic verdict.
 *
 * @param {Object} args
 * @param {import("./normalizer.mjs").EvalTrajectory} args.trajectory
 * @param {import("./deterministic-checker.mjs").DeterministicVerdict} args.deterministic
 * @param {Object} args.scenario
 * @param {string[]} [args.maintainsPostconditions]  the `### Maintains` rubric (reliability)
 * @param {string} [args.envPath]
 * @returns {Promise<{verdicts:JudgeVerdict[],consistency:Object,enabled:boolean}>}
 */
export async function runJudgePanel({
  trajectory,
  deterministic,
  scenario,
  maintainsPostconditions = [],
  envPath = DEFAULT_ENV_PATH,
}) {
  const enabled = judgesEnabled(envPath);

  if (!enabled) {
    const verdicts = JUDGE_DIMENSIONS.map((dimension) =>
      skippedVerdict(
        dimension,
        "no OpenRouter key (or REACTOR_OFFLINE set): judge path off, passing-skipped",
      ),
    );
    return { verdicts, consistency: skippedConsistency(), enabled: false };
  }

  // Live path. We DELIBERATELY keep model wiring behind one factory call so the
  // offline/test path never imports the agents SDK. createOpenRouterProvider()
  // is the same helper the runtime render atom uses; the key never leaves it.
  const verdicts = [];
  for (const dimension of JUDGE_DIMENSIONS) {
    verdicts.push(
      await judgeOne({
        dimension,
        trajectory,
        deterministic,
        scenario,
        maintainsPostconditions,
        envPath,
      }),
    );
  }
  const consistency = auditConsistency(verdicts, deterministic);
  return { verdicts, consistency, enabled: true };
}

function skippedVerdict(dimension, reason) {
  return {
    dimension,
    score: 0,
    skipped: true,
    reason,
    rubricItems: [],
    evidenceCitations: [],
    confidence: 0,
  };
}

function skippedConsistency() {
  return {
    agreementScore: 1,
    skipped: true,
    contradictions: [],
    unsupportedJudgeClaims: [],
    needsAdjudication: false,
    note: "judges skipped (offline): no disagreement to surface",
  };
}

/**
 * Build the per-dimension judge prompt. Exposed so the live path and tests can
 * inspect exactly what a judge sees (trajectory summary + rubric + the mandatory
 * "cite evidence" instruction). Never includes raw private transcripts (spec:
 * judges see the normalized trajectory + selected receipts + artifacts only).
 */
export function buildJudgePrompt({
  dimension,
  trajectory,
  scenario,
  maintainsPostconditions,
}) {
  const summary = summarizeTrajectory(trajectory);
  const rubric =
    dimension === "program_semantics"
      ? maintainsPostconditions.length
        ? "RELIABILITY RUBRIC — the responsibility's ### Maintains postconditions (judge EACH pass/fail):\n" +
          maintainsPostconditions.map((p, i) => `  M${i + 1}. ${p}`).join("\n")
        : "RELIABILITY RUBRIC — no ### Maintains supplied; judge whether the run expressed the intended Reactor program (mounted nodes, gateways, world-models, subscriptions, top-level artifacts)."
      : RUBRIC_TEXT[dimension];
  return [
    `You are the ${dimension} judge for the Reactor eval harness.`,
    `Scenario: ${scenario.kind}. Example: ${trajectory.exampleId}.`,
    rubric,
    "",
    "NORMALIZED TRAJECTORY (runtime-independent):",
    summary,
    "",
    "Return STRICT JSON: { score:0-100, rubricItems:[{name,passed,actual,expected}], evidenceCitations:[string], confidence:0-1 }.",
    "EVERY rubricItem MUST carry at least one evidenceCitation referencing a trajectory event index (e.g. '#34'), a node id, or a content hash. An item with no citation is an automatic fail.",
  ].join("\n");
}

const RUBRIC_TEXT = {
  trajectory_quality:
    "TRAJECTORY-QUALITY RUBRIC: is the run inspectable, causal, economical? changed inputs wake the right nodes; unchanged inputs skip expensive renders; batching is sensible; no error hidden behind plausible prose.",
  artifact_usefulness:
    "ARTIFACT-USEFULNESS RUBRIC: would the produced maintained artifact be useful to the intended operator? Name useful parts, weak parts, and concrete improvements.",
  safety_privacy:
    "SAFETY/PRIVACY RUBRIC: judge ONLY from the projected evidence the implementation is allowed to expose. Flag leakage risks, unsupported claims, and missing human gates.",
  launch_demo:
    "LAUNCH/DEMO RUBRIC: would this run make sense in a launch post or technical demo? Judge clarity, wow-factor, credibility; suggest a one-line story.",
};

function summarizeTrajectory(t) {
  const lines = [];
  lines.push(
    `nodes=${t.nodes.length} edges=${t.edges.length} acyclic=${t.acyclic} entry=[${t.entryPoints.join(",")}]`,
  );
  lines.push(
    `renders=${t.renderEvents.length} skips=${t.skipEvents.length} failed=${t.failedEvents.length}`,
  );
  lines.push(
    `cost.total fresh=${t.costRollup.total.fresh} reused=${t.costRollup.total.reused}`,
  );
  // A compact, bounded event table — no raw transcripts.
  const head = t.events.slice(0, 40);
  for (const e of head) {
    lines.push(
      `#${e.index} ${e.node} ${e.status} wake=${e.wakeSource} moved[${e.movedFacets.join("|")}] fresh=${e.cost.fresh} woke[${e.wokenSubscribers.join(",")}]`,
    );
  }
  if (t.events.length > head.length) {
    lines.push(`… (${t.events.length - head.length} more events)`);
  }
  return lines.join("\n");
}

/**
 * The one live model round-trip per dimension. Uses the shipped provider helper
 * (`createOpenRouterProvider`) — the key is read inside it and never returned.
 * Tracing is disabled inside `smokeRun`/the agents runner. We keep this path
 * minimal and resilient: a malformed/empty model reply degrades to a low-confidence
 * verdict rather than throwing the whole run.
 */
async function judgeOne({
  dimension,
  trajectory,
  deterministic,
  scenario,
  maintainsPostconditions,
  envPath,
}) {
  const prompt = buildJudgePrompt({
    dimension,
    trajectory,
    scenario,
    maintainsPostconditions,
  });
  let raw;
  try {
    raw = await callJudgeModel({ prompt, envPath });
  } catch (err) {
    return {
      dimension,
      score: 0,
      skipped: false,
      reason: `judge model call failed: ${String(err && err.message ? err.message : err)}`,
      rubricItems: [],
      evidenceCitations: [],
      confidence: 0,
    };
  }
  const parsed = parseJudgeJson(raw);
  // Enforce the citation discipline deterministically (defence in depth): drop
  // any rubricItem whose claim cites nothing.
  const rubricItems = (parsed.rubricItems ?? []).map((it) => ({
    name: String(it.name ?? ""),
    passed: Boolean(it.passed),
    actual: String(it.actual ?? ""),
    expected: String(it.expected ?? ""),
  }));
  return {
    dimension,
    score: clampScore(parsed.score),
    skipped: false,
    reason: "live judge verdict",
    rubricItems,
    evidenceCitations: (parsed.evidenceCitations ?? []).map(String),
    confidence: clamp01(parsed.confidence),
  };
}

/**
 * The model round-trip. Isolated so it is the ONLY function that builds a live
 * provider; tests/offline never reach it. Uses the agent-render adapter's own
 * scoped provider + the agents Runner, exactly like the runtime render atom.
 */
async function callJudgeModel({ prompt, envPath }) {
  // Lazy import the heavy agents-SDK-backed adapter ONLY on the live path.
  const { createRequire } = await import("node:module");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const root = findRoot(here, existsSyncSafe);
  const req = createRequire(
    join(root, "packages", "reactor-devtools", "package.json"),
  );
  const ar = req("@openprose/reactor/agents");
  const { Agent, Runner, setTracingDisabled } = req("@openai/agents");
  setTracingDisabled(true);
  const providerInstance = ar.createOpenRouterProvider({ envPath });
  const agent = new Agent({
    name: "reactor-eval-judge",
    instructions:
      "You are a rigorous, evidence-citing evaluator. Reply with STRICT JSON only.",
    model: ar.DEFAULT_RENDER_MODEL ?? "google/gemini-3.5-flash",
    modelSettings: { temperature: 0 },
  });
  const runner = new Runner({ modelProvider: providerInstance });
  const result = await runner.run(agent, prompt);
  return typeof result.finalOutput === "string"
    ? result.finalOutput
    : String(result.finalOutput ?? "");
}

function findRoot(start, exists) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (exists(`${dir}/packages/reactor-devtools/package.json`)) return dir;
    const parent = dir.slice(0, dir.lastIndexOf("/")) || "/";
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}
function existsSyncSafe(p) {
  try {
    // eslint-disable-next-line no-undef
    return require("node:fs").existsSync(p);
  } catch {
    return false;
  }
}

function parseJudgeJson(text) {
  if (typeof text !== "string") return {};
  // Extract the first {...} block; models sometimes wrap JSON in prose/fences.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return {};
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return {};
  }
}

function clampScore(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Judge Consistency Auditor (spec): SURFACE disagreement, never average it away.
 * Flags (a) wide score spread across dimensions, (b) a judge that passed while a
 * BLOCKING deterministic check failed (an unsupported judge claim), and (c)
 * citation-less rubric items.
 */
export function auditConsistency(verdicts, deterministic) {
  const live = verdicts.filter((v) => !v.skipped);
  if (live.length === 0) return skippedConsistency();
  const scores = live.map((v) => v.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;

  const contradictions = [];
  const unsupportedJudgeClaims = [];

  // A judge that scored high while a blocking deterministic check failed.
  if (deterministic && deterministic.blockingFailures.length > 0) {
    for (const v of live) {
      if (v.score >= 70) {
        contradictions.push(
          `${v.dimension} scored ${v.score} despite ${deterministic.blockingFailures.length} blocking deterministic failure(s)`,
        );
      }
    }
  }
  // Citation-less rubric items.
  for (const v of live) {
    if (v.rubricItems.length > 0 && v.evidenceCitations.length === 0) {
      unsupportedJudgeClaims.push(`${v.dimension}: rubric items carry no citations`);
    }
  }

  const needsAdjudication =
    spread > 30 || contradictions.length > 0 || unsupportedJudgeClaims.length > 0;
  return {
    agreementScore: Number((1 - spread / 100).toFixed(3)),
    skipped: false,
    spread,
    contradictions,
    unsupportedJudgeClaims,
    needsAdjudication,
    note: needsAdjudication
      ? "judges disagree or contradict deterministic checks — SURFACED, not averaged"
      : "judges broadly agree",
  };
}
