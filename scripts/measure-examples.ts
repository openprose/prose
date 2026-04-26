import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { compileFile } from "../src/compiler";
import { compilePackagePath } from "../src/ir";
import { packagePath } from "../src/package";
import { planFile } from "../src/plan";
import { publishCheckPath } from "../src/publish";
import { runFile } from "../src/run";
import { traceFile } from "../src/trace";
import { scriptedPiRuntime } from "../test/support/scripted-pi-session";
import type { ExecutionPlan, PackageIR, PublishCheckResult, RunRecord } from "../src/types";
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
  run_ms: number;
  status: string;
  eval_status: string | null;
  eval_score: number | null;
  trace_events: number;
  scripted_session_count: number;
  runtime_telemetry: RuntimeTelemetrySnapshot;
}

interface RuntimeTelemetrySnapshot {
  duration_ms: number;
  session_count: number;
  token_usage: null;
  estimated_cost_usd: null;
  telemetry_source: "scripted_pi_unmetered";
}

interface ReleaseChecksSnapshot {
  examples_compile: {
    status: "pass" | "fail";
    elapsed_ms: number;
    component_count: number;
    diagnostic_count: number;
    error_count: number;
  };
  examples_publish_check: PublishCheckSnapshot;
  examples_strict_publish_check: PublishCheckSnapshot;
  scripted_pi_runs: {
    status: "pass" | "fail";
    scenario_count: number;
    total_scripted_sessions: number;
    eval_failures: string[];
  };
  live_pi_smoke: {
    status: "skipped" | "available";
    enabled: boolean;
    model_provider: string;
    model: string;
    reason: string;
  };
}

interface PublishCheckSnapshot {
  status: "pass" | "warn" | "fail";
  strict: boolean;
  elapsed_ms: number;
  blocker_count: number;
  warning_count: number;
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

interface StargazerLoopSnapshot extends ExampleScenarioSnapshot {
  graph_nodes: number;
  memory_artifact_count: number;
  duplicate_suppression_count: number;
  skipped_count: number;
  high_water_mark_result: string | null;
  replay_status: string;
  replay_saved_nodes: number;
  stale_reason_summaries: string[];
}

interface OpportunityLoopSnapshot extends ExampleScenarioSnapshot {
  graph_nodes: number;
  rejected_stale_count: number;
  rejected_missing_provenance_count: number;
  duplicate_suppression_count: number;
  winning_source_url: string | null;
  brand_change_executed_nodes: string[];
  brand_change_reused_nodes: string[];
  brand_change_saved_nodes: number;
  stale_reason_summaries: string[];
}

interface BaselineComparison {
  baseline_label: string;
  assumptions: string[];
  openprose_examples_quality_score: number;
  typed_port_coverage_delta: number;
  effect_declaration_ratio_delta: number;
  brand_change_saved_nodes: number;
  brand_change_saved_sessions: number;
  reactive_loop_saved_nodes: number;
  duplicate_suppression_count: number;
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
    const examplesCompile = await time(() => compilePackagePath(examplesRoot));
    const examplesPublish = await time(() => publishCheckPath(examplesRoot));
    const examplesStrictPublish = await time(() =>
      publishCheckPath(examplesRoot, { strict: true }),
    );

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
    const stargazerPath = resolve(northStarRoot, "stargazer-intake-lite.prose.md");
    const stargazerEvalPath = resolve(
      examplesRoot,
      "evals",
      "north-star",
      "stargazer-intake-lite.eval.prose.md",
    );
    const opportunityPath = resolve(northStarRoot, "opportunity-discovery-lite.prose.md");
    const opportunityEvalPath = resolve(
      examplesRoot,
      "evals",
      "north-star",
      "opportunity-discovery-lite.eval.prose.md",
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

    const stargazerCompile = await time(() => compileFile(stargazerPath));
    const stargazerBase = await time(async () =>
      runFile(stargazerPath, {
        runRoot: tempRoot,
        runId: "measure-stargazer-base",
        createdAt: "2026-04-26T15:15:00.000Z",
        inputs: {
          stargazer_batch: await fixture(
            fixturesRoot,
            "stargazer-intake-lite/duplicate-high-water.stargazer-batch.json",
          ),
          prior_stargazer_memory: await fixture(
            fixturesRoot,
            "stargazer-intake-lite/happy.prior-stargazer-memory.json",
          ),
          fixture_root: fixturesRoot,
        },
        approvedEffects: ["writes_memory"],
        requiredEvals: [stargazerEvalPath],
        provider: scriptedPiRuntime({
          submissionsByComponent: {
            ...stargazerSubmissions(),
            "stargazer-intake-lite-eval": evalSubmission(true, 0.94, "pass"),
          },
        }),
      }),
    );
    const stargazerTrace = await traceFile(stargazerBase.value.run_dir);
    const stargazerReplay = await time(async () =>
      runFile(stargazerPath, {
        runRoot: tempRoot,
        runId: "measure-stargazer-replay-unused",
        currentRunPath: stargazerBase.value.run_dir,
        createdAt: "2026-04-26T15:20:00.000Z",
        inputs: {
          stargazer_batch: await fixture(
            fixturesRoot,
            "stargazer-intake-lite/duplicate-high-water.stargazer-batch.json",
          ),
          prior_stargazer_memory: await fixture(
            fixturesRoot,
            "stargazer-intake-lite/happy.prior-stargazer-memory.json",
          ),
        },
        approvedEffects: ["writes_memory"],
      }),
    );
    const stargazerBatchDelta = await readRunJsonOutput<{
      skipped?: Array<{ reason?: string }>;
    }>(stargazerBase.value.run_dir, stargazerBase.value.record, "stargazer_batch_delta");
    const stargazerMemoryDelta = await readRunJsonOutput<{
      high_water_mark?: string;
    }>(stargazerBase.value.run_dir, stargazerBase.value.record, "stargazer_memory_delta");

    const opportunityCompile = await time(() => compileFile(opportunityPath));
    const opportunityBase = await time(async () =>
      runFile(opportunityPath, {
        runRoot: tempRoot,
        runId: "measure-opportunity-base",
        createdAt: "2026-04-26T15:25:00.000Z",
        inputs: {
          platform_scan_results: await fixture(
            fixturesRoot,
            "opportunity-discovery-lite/duplicate-crossposts.platform-scan-results.json",
          ),
          brand_context: await fixture(
            fixturesRoot,
            "opportunity-discovery-lite/happy.brand-context.md",
          ),
          fixture_root: fixturesRoot,
        },
        requiredEvals: [opportunityEvalPath],
        provider: scriptedPiRuntime({
          submissionsByComponent: {
            ...opportunitySubmissions("source-aware"),
            "opportunity-discovery-lite-eval": evalSubmission(true, 0.92, "pass"),
          },
        }),
      }),
    );
    const opportunityTrace = await traceFile(opportunityBase.value.run_dir);
    const opportunityBrandRefresh = await time(async () =>
      runFile(opportunityPath, {
        runRoot: tempRoot,
        runId: "measure-opportunity-brand-refresh",
        currentRunPath: opportunityBase.value.run_dir,
        createdAt: "2026-04-26T15:30:00.000Z",
        inputs: {
          platform_scan_results: await fixture(
            fixturesRoot,
            "opportunity-discovery-lite/duplicate-crossposts.platform-scan-results.json",
          ),
          brand_context: "# Brand Context\n\nOpenProse now leads with enterprise provenance.",
        },
        targetOutputs: ["opportunity_summary"],
        provider: scriptedPiRuntime({
          submissionsByComponent: downstreamOpportunitySubmissions("enterprise"),
        }),
      }),
    );
    const opportunityWindow = await readRunJsonOutput<{
      rejected_rows?: Array<{ reason?: string }>;
    }>(opportunityBase.value.run_dir, opportunityBase.value.record, "platform_scan_window");
    const opportunityDedupe = await readRunJsonOutput<{
      clusters?: Array<{ winner?: string; duplicates?: string[] }>;
    }>(opportunityBase.value.run_dir, opportunityBase.value.record, "opportunity_dedupe_report");

    const brandSavedNodes =
      leadBase.value.node_records.length -
      leadBrandRefresh.value.plan.materialization_set.nodes.length;
    const brandSavedSessions =
      sessionCount(leadBaseTrace.events) - sessionCount(leadBrandTrace.events);
    const stargazerReplaySavedNodes =
      stargazerBase.value.node_records.length -
      stargazerReplay.value.plan.materialization_set.nodes.length;
    const opportunityBrandSavedNodes =
      opportunityBase.value.node_records.length -
      opportunityBrandRefresh.value.plan.materialization_set.nodes.length;
    const reactiveLoopSavedNodes = stargazerReplaySavedNodes + opportunityBrandSavedNodes;
    const duplicateSuppressionCount =
      duplicateSkipCount(stargazerBatchDelta.skipped ?? []) +
      duplicateClusterSuppressionCount(opportunityDedupe.clusters ?? []);

    const scenarios = {
      company_signal_brief: {
        compile_ms: round2(companyCompile.elapsed_ms),
        run_ms: round2(companyRun.elapsed_ms),
        status: companyRun.value.record.status,
        eval_status: evalStatus(companyRun.value.record),
        eval_score: evalScore(companyRun.value.record),
        trace_events: companyTrace.events.length,
        scripted_session_count: sessionCount(companyTrace.events),
        runtime_telemetry: runtimeTelemetry(companyRun.elapsed_ms, sessionCount(companyTrace.events)),
      } satisfies ExampleScenarioSnapshot,
      lead_program_designer: {
        compile_ms: round2(leadCompile.elapsed_ms),
        run_ms: round2(leadBase.elapsed_ms),
        status: leadBase.value.record.status,
        eval_status: evalStatus(leadBase.value.record),
        eval_score: evalScore(leadBase.value.record),
        trace_events: leadBaseTrace.events.length,
        scripted_session_count: sessionCount(leadBaseTrace.events),
        runtime_telemetry: runtimeTelemetry(leadBase.elapsed_ms, sessionCount(leadBaseTrace.events)),
        graph_nodes: leadBase.value.node_records.length,
        first_run_executed_nodes: leadBase.value.node_records.map((record) => record.component_ref),
        brand_change_executed_nodes: leadBrandRefresh.value.plan.materialization_set.nodes,
        brand_change_reused_nodes: reusedNodes(leadBrandRefresh.value.plan),
        brand_change_session_count: sessionCount(leadBrandTrace.events),
        profile_change_executed_nodes: leadProfilePlan.value.materialization_set.nodes,
        profile_change_reused_nodes: reusedNodes(leadProfilePlan.value),
      } satisfies LeadProgramSnapshot,
      stargazer_intake_lite: {
        compile_ms: round2(stargazerCompile.elapsed_ms),
        run_ms: round2(stargazerBase.elapsed_ms),
        status: stargazerBase.value.record.status,
        eval_status: evalStatus(stargazerBase.value.record),
        eval_score: evalScore(stargazerBase.value.record),
        trace_events: stargazerTrace.events.length,
        scripted_session_count: sessionCount(stargazerTrace.events),
        runtime_telemetry: runtimeTelemetry(stargazerBase.elapsed_ms, sessionCount(stargazerTrace.events)),
        graph_nodes: stargazerBase.value.node_records.length,
        memory_artifact_count: stargazerBase.value.record.outputs.filter((output) =>
          output.port.includes("memory"),
        ).length,
        duplicate_suppression_count: duplicateSkipCount(stargazerBatchDelta.skipped ?? []),
        skipped_count: stargazerBatchDelta.skipped?.length ?? 0,
        high_water_mark_result: stargazerMemoryDelta.high_water_mark ?? null,
        replay_status: stargazerReplay.value.plan.status,
        replay_saved_nodes: stargazerReplaySavedNodes,
        stale_reason_summaries: staleReasons(stargazerReplay.value.plan),
      } satisfies StargazerLoopSnapshot,
      opportunity_discovery_lite: {
        compile_ms: round2(opportunityCompile.elapsed_ms),
        run_ms: round2(opportunityBase.elapsed_ms),
        status: opportunityBase.value.record.status,
        eval_status: evalStatus(opportunityBase.value.record),
        eval_score: evalScore(opportunityBase.value.record),
        trace_events: opportunityTrace.events.length,
        scripted_session_count: sessionCount(opportunityTrace.events),
        runtime_telemetry: runtimeTelemetry(
          opportunityBase.elapsed_ms,
          sessionCount(opportunityTrace.events),
        ),
        graph_nodes: opportunityBase.value.node_records.length,
        rejected_stale_count: reasonCount(opportunityWindow.rejected_rows ?? [], "older than"),
        rejected_missing_provenance_count: reasonCount(
          opportunityWindow.rejected_rows ?? [],
          "missing url",
        ),
        duplicate_suppression_count: duplicateClusterSuppressionCount(
          opportunityDedupe.clusters ?? [],
        ),
        winning_source_url: opportunityDedupe.clusters?.[0]?.winner ?? null,
        brand_change_executed_nodes: opportunityBrandRefresh.value.plan.materialization_set.nodes,
        brand_change_reused_nodes: reusedNodes(opportunityBrandRefresh.value.plan),
        brand_change_saved_nodes: opportunityBrandSavedNodes,
        stale_reason_summaries: staleReasons(opportunityBrandRefresh.value.plan),
      } satisfies OpportunityLoopSnapshot,
      approval_gated_release: {
        elapsed_ms: round2(approvalPlan.elapsed_ms),
        status: approvalPlan.value.status,
        blocked_effect_nodes: approvalPlan.value.nodes
          .filter((node) => node.status === "blocked_effect")
          .map((node) => node.component_ref),
      },
    };

    const report = {
      measurement_version: "0.2",
      generated_at: new Date().toISOString(),
      release_checks: releaseChecks(
        examplesCompile,
        examplesPublish,
        examplesStrictPublish,
        scenarios,
      ),
      packages,
      scenarios,
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
        reactive_loop_saved_nodes: reactiveLoopSavedNodes,
        duplicate_suppression_count: duplicateSuppressionCount,
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
  measurement_version: string;
  generated_at: string;
  release_checks: ReleaseChecksSnapshot;
  packages: PackageSnapshot[];
  scenarios: {
    company_signal_brief: ExampleScenarioSnapshot;
    lead_program_designer: LeadProgramSnapshot;
    stargazer_intake_lite: StargazerLoopSnapshot;
    opportunity_discovery_lite: OpportunityLoopSnapshot;
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
  lines.push(`Version: ${report.measurement_version}`);
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push("## Release Checks");
  lines.push("");
  lines.push("| Check | Status | Detail |");
  lines.push("|---|---|---|");
  lines.push(
    `| examples compile | ${report.release_checks.examples_compile.status} | ${report.release_checks.examples_compile.component_count} components, ${report.release_checks.examples_compile.error_count} errors |`,
  );
  lines.push(
    `| examples publish-check | ${report.release_checks.examples_publish_check.status} | ${report.release_checks.examples_publish_check.warning_count} warnings, ${report.release_checks.examples_publish_check.blocker_count} blockers |`,
  );
  lines.push(
    `| examples strict publish-check | ${report.release_checks.examples_strict_publish_check.status} | ${report.release_checks.examples_strict_publish_check.warning_count} warnings, ${report.release_checks.examples_strict_publish_check.blocker_count} blockers |`,
  );
  lines.push(
    `| scripted Pi runs | ${report.release_checks.scripted_pi_runs.status} | ${report.release_checks.scripted_pi_runs.scenario_count} scenarios, ${report.release_checks.scripted_pi_runs.total_scripted_sessions} sessions |`,
  );
  lines.push(
    `| live Pi smoke | ${report.release_checks.live_pi_smoke.status} | ${report.release_checks.live_pi_smoke.reason} |`,
  );
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
  lines.push(`- run time: ${report.scenarios.company_signal_brief.run_ms.toFixed(2)} ms`);
  lines.push(`- eval: ${report.scenarios.company_signal_brief.eval_status} (${scoreText(report.scenarios.company_signal_brief.eval_score)})`);
  lines.push(`- scripted Pi sessions: ${report.scenarios.company_signal_brief.scripted_session_count}`);
  lines.push("- estimated cost: n/a (scripted Pi)");
  lines.push(`- trace events: ${report.scenarios.company_signal_brief.trace_events}`);
  lines.push("");
  lines.push("### Lead Program Designer");
  lines.push(`- status: ${report.scenarios.lead_program_designer.status}`);
  lines.push(`- graph nodes: ${report.scenarios.lead_program_designer.graph_nodes}`);
  lines.push(`- run time: ${report.scenarios.lead_program_designer.run_ms.toFixed(2)} ms`);
  lines.push(`- eval: ${report.scenarios.lead_program_designer.eval_status} (${scoreText(report.scenarios.lead_program_designer.eval_score)})`);
  lines.push(`- first-run sessions: ${report.scenarios.lead_program_designer.scripted_session_count}`);
  lines.push(`- first-run executed nodes: ${listOrNone(report.scenarios.lead_program_designer.first_run_executed_nodes)}`);
  lines.push(`- brand-change executed nodes: ${listOrNone(report.scenarios.lead_program_designer.brand_change_executed_nodes)}`);
  lines.push(`- brand-change reused nodes: ${listOrNone(report.scenarios.lead_program_designer.brand_change_reused_nodes)}`);
  lines.push(`- brand-change sessions: ${report.scenarios.lead_program_designer.brand_change_session_count}`);
  lines.push(`- profile-change executed nodes: ${listOrNone(report.scenarios.lead_program_designer.profile_change_executed_nodes)}`);
  lines.push(`- profile-change reused nodes: ${listOrNone(report.scenarios.lead_program_designer.profile_change_reused_nodes)}`);
  lines.push("");
  lines.push("### Stargazer Intake Lite");
  lines.push(`- status: ${report.scenarios.stargazer_intake_lite.status}`);
  lines.push(`- graph nodes: ${report.scenarios.stargazer_intake_lite.graph_nodes}`);
  lines.push(`- run time: ${report.scenarios.stargazer_intake_lite.run_ms.toFixed(2)} ms`);
  lines.push(`- eval: ${report.scenarios.stargazer_intake_lite.eval_status} (${scoreText(report.scenarios.stargazer_intake_lite.eval_score)})`);
  lines.push(`- scripted Pi sessions: ${report.scenarios.stargazer_intake_lite.scripted_session_count}`);
  lines.push(`- memory artifacts: ${report.scenarios.stargazer_intake_lite.memory_artifact_count}`);
  lines.push(`- skipped rows: ${report.scenarios.stargazer_intake_lite.skipped_count}`);
  lines.push(`- duplicate suppressions: ${report.scenarios.stargazer_intake_lite.duplicate_suppression_count}`);
  lines.push(`- high-water mark: ${report.scenarios.stargazer_intake_lite.high_water_mark_result ?? "n/a"}`);
  lines.push(`- replay status: ${report.scenarios.stargazer_intake_lite.replay_status}`);
  lines.push(`- replay saved nodes: ${report.scenarios.stargazer_intake_lite.replay_saved_nodes}`);
  lines.push("");
  lines.push("### Opportunity Discovery Lite");
  lines.push(`- status: ${report.scenarios.opportunity_discovery_lite.status}`);
  lines.push(`- graph nodes: ${report.scenarios.opportunity_discovery_lite.graph_nodes}`);
  lines.push(`- run time: ${report.scenarios.opportunity_discovery_lite.run_ms.toFixed(2)} ms`);
  lines.push(`- eval: ${report.scenarios.opportunity_discovery_lite.eval_status} (${scoreText(report.scenarios.opportunity_discovery_lite.eval_score)})`);
  lines.push(`- scripted Pi sessions: ${report.scenarios.opportunity_discovery_lite.scripted_session_count}`);
  lines.push(`- stale rows rejected: ${report.scenarios.opportunity_discovery_lite.rejected_stale_count}`);
  lines.push(`- missing-provenance rows rejected: ${report.scenarios.opportunity_discovery_lite.rejected_missing_provenance_count}`);
  lines.push(`- duplicate suppressions: ${report.scenarios.opportunity_discovery_lite.duplicate_suppression_count}`);
  lines.push(`- winning source: ${report.scenarios.opportunity_discovery_lite.winning_source_url ?? "n/a"}`);
  lines.push(`- brand-change executed nodes: ${listOrNone(report.scenarios.opportunity_discovery_lite.brand_change_executed_nodes)}`);
  lines.push(`- brand-change reused nodes: ${listOrNone(report.scenarios.opportunity_discovery_lite.brand_change_reused_nodes)}`);
  lines.push(`- brand-change saved nodes: ${report.scenarios.opportunity_discovery_lite.brand_change_saved_nodes}`);
  lines.push(`- stale reasons: ${listOrNone(report.scenarios.opportunity_discovery_lite.stale_reason_summaries)}`);
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
    `| reactive-loop node recomputes avoided | ${report.baseline_comparison.reactive_loop_saved_nodes} |`,
  );
  lines.push(
    `| duplicate suppressions measured | ${report.baseline_comparison.duplicate_suppression_count} |`,
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

function releaseChecks(
  examplesCompile: Timed<PackageIR>,
  examplesPublish: Timed<PublishCheckResult>,
  examplesStrictPublish: Timed<PublishCheckResult>,
  scenarios: {
    company_signal_brief: ExampleScenarioSnapshot;
    lead_program_designer: LeadProgramSnapshot;
    stargazer_intake_lite: StargazerLoopSnapshot;
    opportunity_discovery_lite: OpportunityLoopSnapshot;
  },
): ReleaseChecksSnapshot {
  const exampleScenarios = {
    company_signal_brief: scenarios.company_signal_brief,
    lead_program_designer: scenarios.lead_program_designer,
    stargazer_intake_lite: scenarios.stargazer_intake_lite,
    opportunity_discovery_lite: scenarios.opportunity_discovery_lite,
  };
  const evalFailures = Object.entries(exampleScenarios)
    .filter(([, scenario]) => scenario.eval_status !== "passed")
    .map(([name]) => name);
  const failedScenarios = Object.entries(exampleScenarios)
    .filter(([, scenario]) => scenario.status !== "succeeded")
    .map(([name]) => name);
  const errorCount = examplesCompile.value.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  ).length;

  return {
    examples_compile: {
      status: errorCount === 0 ? "pass" : "fail",
      elapsed_ms: round2(examplesCompile.elapsed_ms),
      component_count: examplesCompile.value.components.length,
      diagnostic_count: examplesCompile.value.diagnostics.length,
      error_count: errorCount,
    },
    examples_publish_check: publishCheckSnapshot(examplesPublish),
    examples_strict_publish_check: publishCheckSnapshot(examplesStrictPublish),
    scripted_pi_runs: {
      status: evalFailures.length === 0 && failedScenarios.length === 0 ? "pass" : "fail",
      scenario_count: Object.keys(exampleScenarios).length,
      total_scripted_sessions: Object.values(exampleScenarios).reduce(
        (total, scenario) => total + scenario.scripted_session_count,
        0,
      ),
      eval_failures: [...failedScenarios, ...evalFailures].sort(),
    },
    live_pi_smoke: livePiSmokeSnapshot(),
  };
}

function publishCheckSnapshot(result: Timed<PublishCheckResult>): PublishCheckSnapshot {
  return {
    status: result.value.status,
    strict: result.value.strict,
    elapsed_ms: round2(result.elapsed_ms),
    blocker_count: result.value.blockers.length,
    warning_count: result.value.warnings.length,
  };
}

function livePiSmokeSnapshot(): ReleaseChecksSnapshot["live_pi_smoke"] {
  const enabled = process.env.OPENPROSE_LIVE_PI_SMOKE === "1";
  return {
    status: enabled ? "available" : "skipped",
    enabled,
    model_provider:
      process.env.OPENPROSE_LIVE_PI_MODEL_PROVIDER ??
      process.env.OPENPROSE_PI_MODEL_PROVIDER ??
      "openrouter",
    model:
      process.env.OPENPROSE_LIVE_PI_MODEL_ID ??
      process.env.OPENPROSE_PI_MODEL_ID ??
      "google/gemini-3-flash-preview",
    reason: enabled
      ? "Run bun run smoke:live-pi to write the live Pi smoke report."
      : "Run OPENPROSE_LIVE_PI_SMOKE=1 bun run smoke:live-pi -- --tier cheap.",
  };
}

function runtimeTelemetry(
  elapsedMs: number,
  session_count: number,
): RuntimeTelemetrySnapshot {
  return {
    duration_ms: round2(elapsedMs),
    session_count,
    token_usage: null,
    estimated_cost_usd: null,
    telemetry_source: "scripted_pi_unmetered",
  };
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

function stargazerSubmissions(): Record<string, OutputSubmissionPayload> {
  return {
    "stargazer-batch-reader": submission({
      stargazer_batch_delta: JSON.stringify({
        repo: "openprose/prose",
        high_water_before: "2026-04-25T23:59:59Z",
        new_stargazers: [
          {
            login: "ops-builder",
            starred_at: "2026-04-26T08:15:00Z",
            company: "Northwind Ops",
          },
        ],
        skipped: [
          { login: "prior-founder", reason: "already handled" },
          { login: "ops-builder", reason: "duplicate row" },
        ],
      }),
    }),
    "stargazer-prioritizer": submission({
      prioritized_stargazers: JSON.stringify({
        rows: [
          {
            login: "ops-builder",
            rank: 1,
            reason: "strong agent platform signal",
          },
        ],
      }),
    }),
    "stargazer-profile-classifier": submission({
      stargazer_enrichment_records: JSON.stringify({
        rows: [
          {
            login: "ops-builder",
            repo: "openprose/prose",
            starred_at: "2026-04-26T08:15:00Z",
            public_reason: "building internal agent platforms",
            private_note: "internal platform buyer",
          },
        ],
      }),
    }),
    "stargazer-memory-writer": submission(
      {
        stargazer_memory_delta: JSON.stringify({
          high_water_mark: "2026-04-26T08:15:00Z",
          handled_logins: ["ops-builder"],
          skipped_logins: ["prior-founder"],
        }),
      },
      ["writes_memory"],
    ),
    "stargazer-digest-writer": submission({
      stargazer_digest: "# Stargazer Digest\n\nFollow up with ops-builder.",
    }),
  };
}

function opportunitySubmissions(
  variant: "source-aware",
): Record<string, OutputSubmissionPayload> {
  return {
    "platform-scan-reader": submission({
      platform_scan_window: JSON.stringify({
        scanned_at: "2026-04-26T12:35:00Z",
        accepted_rows: [
          {
            source: "hn",
            url: "https://news.ycombinator.com/item?id=1003",
            canonical_topic: "agent-audit-trails",
            posted_at: "2026-04-26T10:00:00Z",
            reach: 180,
          },
          {
            source: "x",
            url: "https://x.example/status/1003",
            canonical_topic: "agent-audit-trails",
            posted_at: "2026-04-26T10:15:00Z",
            reach: 420,
          },
        ],
        rejected_rows: [
          {
            url: "https://reddit.example/r/aiops/comments/old-audit-thread",
            reason: "older than 7 days",
          },
          {
            source: "mastodon",
            reason: "missing url provenance",
          },
        ],
      }),
    }),
    ...downstreamOpportunitySubmissions(variant),
  };
}

function downstreamOpportunitySubmissions(
  variant: "source-aware" | "enterprise",
): Record<string, OutputSubmissionPayload> {
  return {
    "opportunity-classifier": submission({
      opportunity_classifications: JSON.stringify({
        rows: [
          {
            url: "https://news.ycombinator.com/item?id=1003",
            canonical_topic: "agent-audit-trails",
            relevance: "high",
            urgency: "medium",
            audience: "platform engineering leaders",
            quality_reason: "operator asks directly about auditable agent workflows",
          },
          {
            url: "https://x.example/status/1003",
            canonical_topic: "agent-audit-trails",
            relevance: "high",
            urgency: "high",
            audience: "AI operations buyers",
            quality_reason: "active thread with higher reach and clear audit pain",
          },
        ],
      }),
    }),
    "opportunity-deduplicator": submission({
      opportunity_dedupe_report: JSON.stringify({
        clusters: [
          {
            topic: "agent-audit-trails",
            winner: "https://x.example/status/1003",
            winner_reason: "highest reach among fresh duplicates",
            duplicates: [
              "https://news.ycombinator.com/item?id=1003",
              "https://x.example/status/1003",
            ],
          },
        ],
      }),
    }),
    "opportunity-summary-writer": submission({
      opportunity_summary: [
        "# Opportunity Summary",
        "",
        variant === "enterprise"
          ? "Lead with a helpful answer on provenance controls for enterprise registries."
          : "Lead with a helpful answer on audit trails before mentioning OpenProse.",
        "Source: https://x.example/status/1003",
      ].join("\n"),
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

function submission(
  outputs: Record<string, string>,
  performedEffects: string[] = ["pure"],
): OutputSubmissionPayload {
  return {
    outputs: Object.entries(outputs).map(([port, content]) => ({ port, content })),
    performed_effects: performedEffects,
  };
}

async function fixture(root: string, path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

async function readRunJsonOutput<T>(
  runDir: string,
  record: RunRecord,
  port: string,
): Promise<T> {
  return JSON.parse(await readRunOutput(runDir, record, port)) as T;
}

async function readRunOutput(
  runDir: string,
  record: RunRecord,
  port: string,
): Promise<string> {
  const output = record.outputs.find((candidate) => candidate.port === port);
  if (!output) {
    throw new Error(`Missing output '${port}' in ${record.run_id}.`);
  }
  return readFile(resolve(runDir, output.artifact_ref), "utf8");
}

function sessionCount(events: Array<{ event: string }>): number {
  return events.filter((event) => event.event === "provider.session").length;
}

function reusedNodes(plan: ExecutionPlan): string[] {
  return plan.nodes
    .filter((node) => node.status === "current")
    .map((node) => node.component_ref);
}

function staleReasons(plan: ExecutionPlan): string[] {
  return Array.from(
    new Set(plan.nodes.flatMap((node) => node.stale_reasons)),
  ).sort();
}

function duplicateSkipCount(rows: Array<{ reason?: string }>): number {
  return reasonCount(rows, "duplicate");
}

function duplicateClusterSuppressionCount(
  clusters: Array<{ duplicates?: string[] }>,
): number {
  return clusters.reduce(
    (total, cluster) => total + Math.max(0, (cluster.duplicates?.length ?? 0) - 1),
    0,
  );
}

function reasonCount(rows: Array<{ reason?: string }>, needle: string): number {
  const normalized = needle.toLowerCase();
  return rows.filter((row) => row.reason?.toLowerCase().includes(normalized)).length;
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
