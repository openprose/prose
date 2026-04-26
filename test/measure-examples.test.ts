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
    expect(report.baseline_comparison.brand_change_saved_nodes).toBe(2);
    expect(report.baseline_comparison.brand_change_saved_sessions).toBe(2);
  });
});
