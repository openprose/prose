import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";

describe("OpenProse example measurements", () => {
  test("generated measurement JSON matches the north-star release-gate schema", () => {
    const report = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "docs", "measurements", "latest.json"), "utf8"),
    );

    expectMeasurementReportSchema(report);
    expect(report.release_checks).toMatchObject({
      examples_compile: {
        status: "pass",
        component_count: 42,
        error_count: 0,
      },
      examples_publish_check: {
        status: "pass",
        strict: false,
        blocker_count: 0,
      },
      examples_strict_publish_check: {
        status: "pass",
        strict: true,
        blocker_count: 0,
      },
      scripted_pi_runs: {
        status: "pass",
        scenario_count: 4,
        total_scripted_sessions: 13,
        eval_failures: [],
      },
      live_pi_smoke: {
        status: "skipped",
        enabled: false,
        model_provider: "openrouter",
        model: "google/gemini-3-flash-preview",
      },
    });
    expect(report.scenarios.company_signal_brief).toMatchObject({
      status: "succeeded",
      eval_status: "passed",
      scripted_session_count: 1,
      runtime_telemetry: {
        session_count: 1,
        token_usage: null,
        estimated_cost_usd: null,
        telemetry_source: "scripted_pi_unmetered",
      },
    });
    expect(report.scenarios.lead_program_designer).toMatchObject({
      status: "succeeded",
      eval_status: "passed",
      graph_nodes: 3,
      scripted_session_count: 3,
      brand_change_executed_nodes: ["save-grow-program-drafter"],
      brand_change_reused_nodes: [
        "lead-profile-normalizer",
        "lead-qualification-scorer",
      ],
      brand_change_session_count: 1,
      runtime_telemetry: {
        session_count: 3,
        token_usage: null,
        estimated_cost_usd: null,
      },
    });
    expect(report.scenarios.stargazer_intake_lite).toMatchObject({
      status: "succeeded",
      eval_status: "passed",
      graph_nodes: 5,
      memory_artifact_count: 1,
      duplicate_suppression_count: 1,
      skipped_count: 2,
      high_water_mark_result: "2026-04-26T08:15:00Z",
      replay_status: "current",
      replay_saved_nodes: 5,
      runtime_telemetry: {
        session_count: 5,
        token_usage: null,
        estimated_cost_usd: null,
      },
    });
    expect(report.scenarios.opportunity_discovery_lite).toMatchObject({
      status: "succeeded",
      eval_status: "passed",
      graph_nodes: 4,
      rejected_stale_count: 1,
      rejected_missing_provenance_count: 1,
      duplicate_suppression_count: 1,
      winning_source_url: "https://x.example/status/1003",
      brand_change_executed_nodes: [
        "opportunity-classifier",
        "opportunity-deduplicator",
        "opportunity-summary-writer",
      ],
      brand_change_reused_nodes: ["platform-scan-reader"],
      brand_change_saved_nodes: 1,
      runtime_telemetry: {
        session_count: 4,
        token_usage: null,
        estimated_cost_usd: null,
      },
    });
    expect(report.baseline_comparison.brand_change_saved_nodes).toBe(2);
    expect(report.baseline_comparison.brand_change_saved_sessions).toBe(2);
    expect(report.baseline_comparison.reactive_loop_saved_nodes).toBe(6);
    expect(report.baseline_comparison.duplicate_suppression_count).toBe(2);
  });
});

function expectMeasurementReportSchema(report: any) {
  expect(report.measurement_version).toBe("0.2");
  expect(typeof report.generated_at).toBe("string");
  expect(Array.isArray(report.packages)).toBe(true);
  expect(typeof report.baseline_comparison).toBe("object");

  expectCompileCheckShape(report.release_checks.examples_compile);
  expectPublishCheckShape(report.release_checks.examples_publish_check, false);
  expectPublishCheckShape(report.release_checks.examples_strict_publish_check, true);
  expect(typeof report.release_checks.scripted_pi_runs.status).toBe("string");
  expect(typeof report.release_checks.scripted_pi_runs.scenario_count).toBe("number");
  expect(typeof report.release_checks.scripted_pi_runs.total_scripted_sessions).toBe("number");
  expect(Array.isArray(report.release_checks.scripted_pi_runs.eval_failures)).toBe(true);
  expect(typeof report.release_checks.live_pi_smoke.status).toBe("string");
  expect(typeof report.release_checks.live_pi_smoke.enabled).toBe("boolean");
  expect(typeof report.release_checks.live_pi_smoke.model_provider).toBe("string");
  expect(typeof report.release_checks.live_pi_smoke.model).toBe("string");
  expect(typeof report.release_checks.live_pi_smoke.reason).toBe("string");

  for (const name of [
    "company_signal_brief",
    "lead_program_designer",
    "stargazer_intake_lite",
    "opportunity_discovery_lite",
  ]) {
    const scenario = report.scenarios[name];
    expect(typeof scenario.compile_ms).toBe("number");
    expect(typeof scenario.run_ms).toBe("number");
    expect(typeof scenario.status).toBe("string");
    expect(typeof scenario.eval_status).toBe("string");
    expect(typeof scenario.eval_score).toBe("number");
    expect(typeof scenario.trace_events).toBe("number");
    expect(typeof scenario.scripted_session_count).toBe("number");
    expect(typeof scenario.runtime_telemetry.duration_ms).toBe("number");
    expect(typeof scenario.runtime_telemetry.session_count).toBe("number");
    expect(scenario.runtime_telemetry.token_usage).toBeNull();
    expect(scenario.runtime_telemetry.estimated_cost_usd).toBeNull();
    expect(scenario.runtime_telemetry.telemetry_source).toBe("scripted_pi_unmetered");
  }

  expect(typeof report.scenarios.approval_gated_release.elapsed_ms).toBe("number");
  expect(typeof report.scenarios.approval_gated_release.status).toBe("string");
  expect(Array.isArray(report.scenarios.approval_gated_release.blocked_effect_nodes)).toBe(true);
}

function expectCompileCheckShape(check: any) {
  expect(typeof check.status).toBe("string");
  expect(typeof check.elapsed_ms).toBe("number");
  expect(typeof check.component_count).toBe("number");
  expect(typeof check.diagnostic_count).toBe("number");
  expect(typeof check.error_count).toBe("number");
}

function expectPublishCheckShape(check: any, strict: boolean) {
  expect(typeof check.status).toBe("string");
  expect(check.strict).toBe(strict);
  expect(typeof check.elapsed_ms).toBe("number");
  expect(typeof check.blocker_count).toBe("number");
  expect(typeof check.warning_count).toBe("number");
}
