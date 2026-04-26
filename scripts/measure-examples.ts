import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { compileFile } from "../src/compiler";
import { packagePath } from "../src/package";
import { planFile } from "../src/plan";
import { publishCheckPath } from "../src/publish";
import { runFile } from "../src/run";
import { traceFile } from "../src/trace";
import { scriptedPiRuntime } from "../test/support/scripted-pi-session";
import type { ExecutionPlan, RunRecord } from "../src/types";
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";

interface Timed<T> {
  elapsed_ms: number;
  value: T;
}

interface PackageSnapshot {
  label: string;
  path: string;
  package_name: string;
  version: string | null;
  components: number;
  quality_score: number;
  typed_port_coverage: number;
  effect_declaration_ratio: number;
  publish_status: string;
  strict_publish_status: string;
}

interface ExampleScenarioSnapshot {
  compile_ms?: number;
  status: string;
  eval_status: string | null;
  eval_score: number | null;
  trace_events: number;
  scripted_session_count: number;
}

interface LeadProgramSnapshot extends ExampleScenarioSnapshot {
  graph_nodes: number;
  first_run_executed_nodes: string[];
  brand_change_executed_nodes: string[];
  brand_change_reused_nodes: string[];
  brand_change_session_count: number;
  profile_change_executed_nodes: string[];
  profile_change_reused_nodes: string[];
}

interface BaselineComparison {
  baseline_label: string;
  assumptions: string[];
  openprose_examples_quality_score: number;
  typed_port_coverage_delta: number;
  effect_declaration_ratio_delta: number;
  brand_change_saved_nodes: number;
  brand_change_saved_sessions: number;
  approval_gate_visible: boolean;
  graph_trace_available: boolean;
  runtime_trace_event_count: number;
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const docsRoot = resolve(repoRoot, "docs", "measurements");
  const tempRoot = await mkdtemp(join(tmpdir(), "openprose-measure-"));
  const examplesRoot = resolve(repoRoot, "examples");
  const northStarRoot = resolve(examplesRoot, "north-star");
  const fixturesRoot = resolve(northStarRoot, "fixtures");

  try {
    const packages = await measurePackages(repoRoot, examplesRoot);
    const examplesPackage = packages.find((snapshot) => snapshot.label === "examples");
    if (!examplesPackage) {
      throw new Error("Examples package measurement was not produced.");
    }

    const companySignalPath = resolve(northStarRoot, "company-signal-brief.prose.md");
    const companySignalEvalPath = resolve(
      examplesRoot,
      "evals",
      "north-star",
      "company-signal-brief.eval.prose.md",
    );
    const leadProgramPath = resolve(northStarRoot, "lead-program-designer.prose.md");
    const leadProgramEvalPath = resolve(
      examplesRoot,
      "evals",
      "north-star",
      "lead-program-designer.eval.prose.md",
    );
    const releasePath = resolve(northStarRoot, "release-proposal-dry-run.prose.md");

    const companyCompile = await time(() => compileFile(companySignalPath));
    const companyRun = await time(async () =>
      runFile(companySignalPath, {
        runRoot: tempRoot,
        runId: "measure-company-signal",
        createdAt: "2026-04-26T15:00:00.000Z",
        inputs: {
          signal_notes: await fixture(fixturesRoot, "company-signal-brief/happy.signal-notes.md"),
          brand_context: await fixture(fixturesRoot, "company-signal-brief/happy.brand-context.md"),
          fixture_root: fixturesRoot,
        },
        requiredEvals: [companySignalEvalPath],
        provider: scriptedPiRuntime({
          submissionsByComponent: {
            "company-signal-brief": submission({
              company_signal_brief: "# Company Signal Brief\n\nDurable agent workflows need typed runs, gates, and traces.",
            }),
            "company-signal-brief-eval": evalSubmission(true, 0.93, "pass"),
          },
        }),
      }),
    );
    const companyTrace = await traceFile(companyRun.value.run_dir);

    const leadCompile = await time(() => compileFile(leadProgramPath));
    const leadBase = await time(async () =>
      runFile(leadProgramPath, {
        runRoot: tempRoot,
        runId: "measure-lead-program-base",
        createdAt: "2026-04-26T15:05:00.000Z",
        inputs: {
          lead_profile: await fixture(fixturesRoot, "lead-program-designer/happy.lead-profile.json"),
          brand_context: await fixture(fixturesRoot, "lead-program-designer/happy.brand-context.md"),
          fixture_root: fixturesRoot,
        },
        requiredEvals: [leadProgramEvalPath],
        provider: scriptedPiRuntime({
          submissionsByComponent: {
            ...leadProgramSubmissions("base"),
            "lead-program-designer-eval": evalSubmission(true, 0.91, "pass"),
          },
        }),
      }),
    );
    const leadBaseTrace = await traceFile(leadBase.value.run_dir);

    const leadBrandRefresh = await time(async () =>
      runFile(leadProgramPath, {
        runRoot: tempRoot,
        runId: "measure-lead-program-brand-refresh",
        currentRunPath: leadBase.value.run_dir,
        createdAt: "2026-04-26T15:10:00.000Z",
        inputs: {
          lead_profile: await fixture(fixturesRoot, "lead-program-designer/happy.lead-profile.json"),
          brand_context: await fixture(fixturesRoot, "lead-program-designer/stale.brand-context.md"),
        },
        targetOutputs: ["lead_program_plan"],
        provider: scriptedPiRuntime({
          submissionsByComponent: {
            "save-grow-program-drafter": submission({
              lead_program_plan: "# Save/Grow Program\n\nUpdated for enterprise registry positioning.",
            }),
          },
        }),
      }),
    );
    const leadBrandTrace = await traceFile(leadBrandRefresh.value.run_dir);

    const leadProfilePlan = await time(async () =>
      planFile(leadProgramPath, {
        inputs: {
          lead_profile: JSON.stringify({
            company: "Acme Robotics",
            buyer: "Chief AI Officer",
            pain: "Agent workflows cannot be audited after incidents.",
          }),
          brand_context: await fixture(fixturesRoot, "lead-program-designer/happy.brand-context.md"),
        },
        currentRunPath: leadBase.value.run_dir,
        targetOutputs: ["lead_program_plan"],
      }),
    );

    const approvalPlan = await time(async () =>
      planFile(releasePath, {
        inputs: {
          release_candidate: await fixture(
            fixturesRoot,
            "release-proposal-dry-run/release-needed.release-candidate.json",
          ),
        },
      }),
    );

    const brandSavedNodes =
      leadBase.value.node_records.length -
      leadBrandRefresh.value.plan.materialization_set.nodes.length;
    const brandSavedSessions =
      sessionCount(leadBaseTrace.events) - sessionCount(leadBrandTrace.events);

    const report = {
      generated_at: new Date().toISOString(),
      packages,
      scenarios: {
        company_signal_brief: {
          compile_ms: round2(companyCompile.elapsed_ms),
          status: companyRun.value.record.status,
          eval_status: evalStatus(companyRun.value.record),
          eval_score: evalScore(companyRun.value.record),
          trace_events: companyTrace.events.length,
          scripted_session_count: sessionCount(companyTrace.events),
        } satisfies ExampleScenarioSnapshot,
        lead_program_designer: {
          compile_ms: round2(leadCompile.elapsed_ms),
          status: leadBase.value.record.status,
          eval_status: evalStatus(leadBase.value.record),
          eval_score: evalScore(leadBase.value.record),
          trace_events: leadBaseTrace.events.length,
          scripted_session_count: sessionCount(leadBaseTrace.events),
          graph_nodes: leadBase.value.node_records.length,
          first_run_executed_nodes: leadBase.value.node_records.map((record) => record.component_ref),
          brand_change_executed_nodes: leadBrandRefresh.value.plan.materialization_set.nodes,
          brand_change_reused_nodes: reusedNodes(leadBrandRefresh.value.plan),
          brand_change_session_count: sessionCount(leadBrandTrace.events),
          profile_change_executed_nodes: leadProfilePlan.value.materialization_set.nodes,
          profile_change_reused_nodes: reusedNodes(leadProfilePlan.value),
        } satisfies LeadProgramSnapshot,
        approval_gated_release: {
          elapsed_ms: round2(approvalPlan.elapsed_ms),
          status: approvalPlan.value.status,
          blocked_effect_nodes: approvalPlan.value.nodes
            .filter((node) => node.status === "blocked_effect")
            .map((node) => node.component_ref),
        },
      },
      baseline_comparison: {
        baseline_label: "plain skill folder",
        assumptions: [
          "instruction files expose no machine-readable typed ports",
          "effects and approvals are conventions unless parsed by a separate system",
          "there is no canonical graph/run materialization record",
          "targeted recompute requires manual operator judgment",
        ],
        openprose_examples_quality_score: examplesPackage.quality_score,
        typed_port_coverage_delta: examplesPackage.typed_port_coverage,
        effect_declaration_ratio_delta: examplesPackage.effect_declaration_ratio,
        brand_change_saved_nodes: brandSavedNodes,
        brand_change_saved_sessions: brandSavedSessions,
        approval_gate_visible: approvalPlan.value.nodes.some(
          (node) => node.status === "blocked_effect",
        ),
        graph_trace_available: leadBaseTrace.events.length > 0,
        runtime_trace_event_count: leadBaseTrace.events.length,
      } satisfies BaselineComparison,
    };

    await mkdir(docsRoot, { recursive: true });
    await writeFile(join(docsRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(join(docsRoot, "latest.md"), renderMarkdownReport(report), "utf8");

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function measurePackages(repoRoot: string, examplesRoot: string): Promise<PackageSnapshot[]> {
  const packageTargets = [
    { label: "examples", path: examplesRoot },
    { label: "packages/std", path: resolve(repoRoot, "packages", "std") },
    { label: "packages/co", path: resolve(repoRoot, "packages", "co") },
  ];

  const referenceCompanyPath = resolve(repoRoot, "..", "..", "..", "customers", "prose-openprose");
  if (existsSync(resolve(referenceCompanyPath, "prose.package.json"))) {
    packageTargets.push({
      label: "customers/prose-openprose",
      path: referenceCompanyPath,
    });
  }

  const packages: PackageSnapshot[] = [];
  for (const target of packageTargets) {
    const metadata = await packagePath(target.path);
    const publish = await publishCheckPath(target.path);
    const strictPublish = await publishCheckPath(target.path, { strict: true });
    packages.push({
      label: target.label,
      path: target.path,
      package_name: metadata.manifest.name,
      version: metadata.manifest.version,
      components: metadata.components.length,
      quality_score: metadata.quality.score,
      typed_port_coverage: metadata.quality.typed_port_coverage,
      effect_declaration_ratio: metadata.quality.effect_declaration_ratio,
      publish_status: publish.status,
      strict_publish_status: strictPublish.status,
    });
  }
  return packages;
}

async function time<T>(work: () => Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  const value = await work();
  return {
    elapsed_ms: performance.now() - start,
    value,
  };
}

function renderMarkdownReport(report: {
  generated_at: string;
  packages: PackageSnapshot[];
  scenarios: {
    company_signal_brief: ExampleScenarioSnapshot;
    lead_program_designer: LeadProgramSnapshot;
    approval_gated_release: {
      elapsed_ms: number;
      status: string;
      blocked_effect_nodes: string[];
    };
  };
  baseline_comparison: BaselineComparison;
}): string {
  const lines: string[] = [];
  lines.push("# OpenProse Measurement Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push("## Package Health");
  lines.push("");
  lines.push("| Target | Components | Quality | Typed Ports | Effects | Publish | Strict |");
  lines.push("|---|---:|---:|---:|---:|---|---|");
  for (const snapshot of report.packages) {
    lines.push(
      `| ${snapshot.label} | ${snapshot.components} | ${snapshot.quality_score.toFixed(2)} | ${formatPercent(snapshot.typed_port_coverage)} | ${formatPercent(snapshot.effect_declaration_ratio)} | ${snapshot.publish_status} | ${snapshot.strict_publish_status} |`,
    );
  }
  lines.push("");
  lines.push("## Scenario Checks");
  lines.push("");
  lines.push("### Company Signal Brief");
  lines.push(`- status: ${report.scenarios.company_signal_brief.status}`);
  lines.push(`- compile time: ${report.scenarios.company_signal_brief.compile_ms?.toFixed(2)} ms`);
  lines.push(`- eval: ${report.scenarios.company_signal_brief.eval_status} (${scoreText(report.scenarios.company_signal_brief.eval_score)})`);
  lines.push(`- scripted Pi sessions: ${report.scenarios.company_signal_brief.scripted_session_count}`);
  lines.push(`- trace events: ${report.scenarios.company_signal_brief.trace_events}`);
  lines.push("");
  lines.push("### Lead Program Designer");
  lines.push(`- status: ${report.scenarios.lead_program_designer.status}`);
  lines.push(`- graph nodes: ${report.scenarios.lead_program_designer.graph_nodes}`);
  lines.push(`- eval: ${report.scenarios.lead_program_designer.eval_status} (${scoreText(report.scenarios.lead_program_designer.eval_score)})`);
  lines.push(`- first-run sessions: ${report.scenarios.lead_program_designer.scripted_session_count}`);
  lines.push(`- first-run executed nodes: ${listOrNone(report.scenarios.lead_program_designer.first_run_executed_nodes)}`);
  lines.push(`- brand-change executed nodes: ${listOrNone(report.scenarios.lead_program_designer.brand_change_executed_nodes)}`);
  lines.push(`- brand-change reused nodes: ${listOrNone(report.scenarios.lead_program_designer.brand_change_reused_nodes)}`);
  lines.push(`- brand-change sessions: ${report.scenarios.lead_program_designer.brand_change_session_count}`);
  lines.push(`- profile-change executed nodes: ${listOrNone(report.scenarios.lead_program_designer.profile_change_executed_nodes)}`);
  lines.push(`- profile-change reused nodes: ${listOrNone(report.scenarios.lead_program_designer.profile_change_reused_nodes)}`);
  lines.push("");
  lines.push("### Approval-Gated Release");
  lines.push(`- plan status: ${report.scenarios.approval_gated_release.status}`);
  lines.push(`- blocked nodes: ${listOrNone(report.scenarios.approval_gated_release.blocked_effect_nodes)}`);
  lines.push("");
  lines.push("## Baseline Skill Folder Comparison");
  lines.push("");
  lines.push(`Baseline: ${report.baseline_comparison.baseline_label}`);
  lines.push("");
  lines.push("Assumptions:");
  for (const assumption of report.baseline_comparison.assumptions) {
    lines.push(`- ${assumption}`);
  }
  lines.push("");
  lines.push("| Signal | OpenProse advantage |");
  lines.push("|---|---:|");
  lines.push(
    `| examples quality score | ${report.baseline_comparison.openprose_examples_quality_score.toFixed(2)} |`,
  );
  lines.push(
    `| typed port coverage delta | ${formatPercent(report.baseline_comparison.typed_port_coverage_delta)} |`,
  );
  lines.push(
    `| effect declaration delta | ${formatPercent(report.baseline_comparison.effect_declaration_ratio_delta)} |`,
  );
  lines.push(
    `| brand-change node recomputes avoided | ${report.baseline_comparison.brand_change_saved_nodes} |`,
  );
  lines.push(
    `| brand-change sessions avoided | ${report.baseline_comparison.brand_change_saved_sessions} |`,
  );
  lines.push(
    `| approval gate visible to planner | ${report.baseline_comparison.approval_gate_visible ? "yes" : "no"} |`,
  );
  lines.push(
    `| graph trace available | ${report.baseline_comparison.graph_trace_available ? "yes" : "no"} |`,
  );
  lines.push(
    `| lead graph trace event count | ${report.baseline_comparison.runtime_trace_event_count} |`,
  );
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function leadProgramSubmissions(label: string): Record<string, OutputSubmissionPayload> {
  return {
    "lead-profile-normalizer": submission({
      lead_normalized_profile: JSON.stringify({
        company: "Acme Robotics",
        buyer: "VP Operations",
        label,
      }),
    }),
    "lead-qualification-scorer": submission({
      lead_qualification_score: JSON.stringify({
        score: 88,
        confidence: "high",
      }),
    }),
    "save-grow-program-drafter": submission({
      lead_program_plan: "# Save/Grow Program\n\nMap handoffs, then package the workflow.",
    }),
  };
}

function evalSubmission(
  passed: boolean,
  score: number,
  verdict: string,
): OutputSubmissionPayload {
  return submission({
    verdict: JSON.stringify({ passed, score, verdict }),
  });
}

function submission(outputs: Record<string, string>): OutputSubmissionPayload {
  return {
    outputs: Object.entries(outputs).map(([port, content]) => ({ port, content })),
    performed_effects: ["pure"],
  };
}

async function fixture(root: string, path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function sessionCount(events: Array<{ event: string }>): number {
  return events.filter((event) => event.event === "provider.session").length;
}

function reusedNodes(plan: ExecutionPlan): string[] {
  return plan.nodes
    .filter((node) => node.status === "current")
    .map((node) => node.component_ref);
}

function evalStatus(record: RunRecord): string | null {
  return record.evals[0]?.status ?? null;
}

function evalScore(record: RunRecord): number | null {
  return record.evals[0]?.score ?? null;
}

function scoreText(score: number | null): string {
  return score === null ? "n/a" : score.toFixed(2);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

await main();
