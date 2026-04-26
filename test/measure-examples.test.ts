import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "./support";

describe("OpenProse example measurements", () => {
  test("generated measurement JSON includes simple north-star examples", () => {
    const report = JSON.parse(
      readFileSync(join(import.meta.dir, "..", "docs", "measurements", "latest.json"), "utf8"),
    );

    expect(report.scenarios.company_signal_brief).toMatchObject({
      status: "succeeded",
      eval_status: "passed",
      scripted_session_count: 1,
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
    });
    expect(report.baseline_comparison.brand_change_saved_nodes).toBe(2);
    expect(report.baseline_comparison.brand_change_saved_sessions).toBe(2);
    expect(report.baseline_comparison.reactive_loop_saved_nodes).toBe(6);
    expect(report.baseline_comparison.duplicate_suppression_count).toBe(2);
  });
});
