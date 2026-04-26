import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileSource,
  describe,
  expect,
  mkdtempSync,
  renderTraceText,
  runSource,
  test,
  tmpdir,
  traceFile,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "company-signal-brief.prose.md",
);
const evalPath = join(
  import.meta.dir,
  "..",
  "examples",
  "evals",
  "north-star",
  "company-signal-brief.eval.prose.md",
);
const fixtureRoot = join(import.meta.dir, "..", "examples", "north-star", "fixtures");

describe("company-signal-brief north-star example", () => {
  test("compiles as a pure single-component company brief service", () => {
    const ir = compileSource(readFileSync(examplePath, "utf8"), { path: examplePath });

    expect(ir.components.map((component) => component.name)).toEqual(["company-signal-brief"]);
    expect(ir.components[0].ports.requires.map((port) => port.name)).toEqual([
      "signal_notes",
      "brand_context",
    ]);
    expect(ir.components[0].ports.ensures.map((port) => port.name)).toEqual([
      "company_signal_brief",
    ]);
    expect(ir.components[0].effects.map((effect) => effect.kind)).toEqual(["pure"]);
  });

  test("runs through scripted Pi and passes its required eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-company-signal-"));
    const result = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "company-signal-accepted",
      inputs: {
        signal_notes: fixture("company-signal-brief/happy.signal-notes.md"),
        brand_context: fixture("company-signal-brief/happy.brand-context.md"),
        fixture_root: fixtureRoot,
      },
      requiredEvals: [evalPath],
      nodeRunner: scriptedPiRuntime({
        submissionsByComponent: {
          "company-signal-brief": {
            outputs: [
              {
                port: "company_signal_brief",
                content: [
                  "# Company Signal Brief",
                  "",
                  "Enterprise buyers want durable agent workflows with approvals and audit trails.",
                  "OpenProse should lead with reactive run records, packageable components, and provenance.",
                  "",
                  "## Next Actions",
                  "",
                  "- Show the lead-program graph as the next demo.",
                  "- Compare a materialized run trace against a one-off skill transcript.",
                ].join("\n"),
              },
            ],
            performed_effects: ["pure"],
          },
          "company-signal-brief-eval": {
            outputs: [
              {
                port: "verdict",
                content: JSON.stringify({
                  passed: true,
                  score: 0.93,
                  verdict: "pass",
                }),
              },
            ],
            performed_effects: ["pure"],
          },
        },
      }),
      createdAt: "2026-04-26T14:00:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.record.evals).toEqual([
      expect.objectContaining({
        eval_ref: evalPath,
        required: true,
        status: "passed",
        score: 0.93,
      }),
    ]);
    const trace = await traceFile(result.run_dir);
    expect(renderTraceText(trace)).toContain("pi.output_submission.accepted");
  });

  test("seeded-bad generic output is rejected by the required eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-company-signal-bad-"));
    const result = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "company-signal-rejected",
      inputs: {
        signal_notes: fixture("company-signal-brief/seeded-bad.signal-notes.md"),
        brand_context: fixture("company-signal-brief/happy.brand-context.md"),
        fixture_root: fixtureRoot,
      },
      requiredEvals: [evalPath],
      nodeRunner: scriptedPiRuntime({
        submissionsByComponent: {
          "company-signal-brief": {
            outputs: [
              {
                port: "company_signal_brief",
                content: "AI is cool. Go viral. Everyone should use agents.",
              },
            ],
            performed_effects: ["pure"],
          },
          "company-signal-brief-eval": {
            outputs: [
              {
                port: "verdict",
                content: JSON.stringify({
                  passed: false,
                  score: 0.21,
                  verdict: "fail: generic and unsupported",
                }),
              },
            ],
            performed_effects: ["pure"],
          },
        },
      }),
      createdAt: "2026-04-26T14:05:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("rejected");
    expect(result.record.evals).toEqual([
      expect.objectContaining({
        eval_ref: evalPath,
        required: true,
        status: "failed",
        score: 0.21,
      }),
    ]);
  });
});

function fixture(path: string): string {
  return readFileSync(join(fixtureRoot, path), "utf8");
}
