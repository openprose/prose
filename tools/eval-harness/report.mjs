// report.mjs — the EvalReport model + Markdown writer.
//
// Spec ("Eval Report Model" + "Eval Report Markdown"): synthesize the per-
// scenario verdicts into one EvalReport, then write a compact Markdown artifact
// for humans and a stable artifact for regression review. We keep timing fields
// OUT of the content hash so re-runs are byte-stable except for explicitly
// volatile fields (spec passing-behavior step 14).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

import { stableStringify } from "./normalizer.mjs";

/**
 * @param {Object} args
 * @param {string} args.runId
 * @param {string} args.harnessBuildId
 * @param {{trajectory:Object,deterministic:Object,judgePanel:Object,verdict:Object}[]} args.results
 * @param {boolean} args.judgesEnabled
 * @param {string[]} [args.skipped]   scenarios skipped, with reasons
 * @returns {Object} EvalReport
 */
export function buildEvalReport({
  runId,
  harnessBuildId,
  results,
  judgesEnabled,
  skipped = [],
}) {
  const perExample = results.map((r) => ({
    exampleId: r.verdict.exampleId,
    scenarioId: r.verdict.scenarioId,
    grade: r.verdict.grade,
    pass: r.verdict.pass,
    overallScore: r.verdict.overallScore,
    blockers: r.verdict.blockers,
    warnings: r.verdict.warnings,
    topFixes: r.verdict.topFixes,
    judgeDisagreementNotes: r.verdict.judgeDisagreementNotes,
    performance: r.verdict.performance,
    trajectoryHash: r.trajectory.trajectoryHash,
    cost: r.trajectory.costRollup.total,
    deterministic: {
      pass: r.deterministic.pass.length,
      fail: r.deterministic.fail.length,
      blocking: r.deterministic.blockingFailures.length,
    },
  }));

  const passed = perExample.filter((p) => p.pass).length;
  const failed = perExample.length - passed;

  return {
    runId,
    harnessBuildId,
    judgesEnabled,
    mode: judgesEnabled ? "deterministic+judges" : "deterministic-only",
    summary: {
      total: perExample.length,
      passed,
      failed,
      blocked: perExample.filter((p) => p.blockers.length > 0).length,
    },
    perExample,
    skipped,
    recommendedNextFixes: dedupe(perExample.flatMap((p) => p.topFixes)).slice(0, 10),
    judgeDisagreementSummary: dedupe(
      perExample.flatMap((p) => p.judgeDisagreementNotes),
    ),
    costSummary: rollupCost(perExample),
  };
}

/** Render the EvalReport as Markdown. Timing-free body → stable content hash. */
export function renderMarkdown(report) {
  const L = [];
  L.push(`# Reactor Eval Report`);
  L.push("");
  L.push(`- Run: \`${report.runId}\``);
  L.push(`- Harness build: \`${report.harnessBuildId}\``);
  L.push(`- Mode: **${report.mode}**` + (report.judgesEnabled ? "" : " (LLM judges OFF — keyless/offline; judge bodies passing-skipped)"));
  L.push(
    `- Result: **${report.summary.passed}/${report.summary.total} passed**, ${report.summary.failed} failed, ${report.summary.blocked} with deterministic blockers`,
  );
  L.push("");

  L.push(`## Per-scenario verdicts`);
  L.push("");
  L.push(`| Example | Scenario | Grade | Pass | Score | Det (p/f/blk) | fresh | reused |`);
  L.push(`|---|---|---|---|---|---|---|---|`);
  for (const p of report.perExample) {
    L.push(
      `| ${p.exampleId} | ${p.scenarioId} | ${p.grade} | ${p.pass ? "✓" : "✗"} | ${p.overallScore} | ${p.deterministic.pass}/${p.deterministic.fail}/${p.deterministic.blocking} | ${p.cost.fresh} | ${p.cost.reused} |`,
    );
  }
  L.push("");

  // Blockers / fixes
  const withBlockers = report.perExample.filter((p) => p.blockers.length > 0);
  if (withBlockers.length > 0) {
    L.push(`## Deterministic blockers (cap grade to F)`);
    L.push("");
    for (const p of withBlockers) {
      L.push(`### ${p.exampleId} / ${p.scenarioId}`);
      for (const b of p.blockers) L.push(`- ⛔ ${b}`);
      L.push("");
    }
  }

  if (report.judgeDisagreementSummary.length > 0) {
    L.push(`## Judge disagreement (surfaced, not averaged)`);
    L.push("");
    for (const d of report.judgeDisagreementSummary) L.push(`- ${d}`);
    L.push("");
  }

  if (report.skipped.length > 0) {
    L.push(`## Skipped scenarios`);
    L.push("");
    for (const s of report.skipped) L.push(`- ${s}`);
    L.push("");
  }

  if (report.recommendedNextFixes.length > 0) {
    L.push(`## Recommended next fixes`);
    L.push("");
    for (const f of report.recommendedNextFixes) L.push(`- ${f}`);
    L.push("");
  }

  L.push(`## Trajectory hashes (regression anchors)`);
  L.push("");
  for (const p of report.perExample) {
    L.push(`- ${p.exampleId}/${p.scenarioId}: \`${p.trajectoryHash}\``);
  }
  L.push("");

  return L.join("\n") + "\n";
}

/**
 * The content hash over the report markdown EXCLUDING volatile fields. Computed
 * over the perExample verdicts + trajectory hashes only (not runId/timestamps),
 * so two identical runs produce the same hash.
 */
export function reportContentHash(report) {
  const stable = report.perExample.map((p) => ({
    exampleId: p.exampleId,
    scenarioId: p.scenarioId,
    grade: p.grade,
    pass: p.pass,
    overallScore: p.overallScore,
    blockers: p.blockers,
    trajectoryHash: p.trajectoryHash,
    cost: p.cost,
  }));
  return (
    "sha256:" + createHash("sha256").update(stableStringify(stable)).digest("hex")
  );
}

/** Write the markdown report to disk and return its path + content hash. */
export function writeReport(report, path) {
  const md = renderMarkdown(report);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, md, "utf8");
  return {
    path,
    contentHash: reportContentHash(report),
    generatedAt: new Date().toISOString(), // volatile, NOT in the hash
  };
}

function dedupe(arr) {
  return [...new Set(arr)];
}
function rollupCost(perExample) {
  let fresh = 0;
  let reused = 0;
  for (const p of perExample) {
    fresh += p.cost.fresh;
    reused += p.cost.reused;
  }
  return { fresh, reused };
}
