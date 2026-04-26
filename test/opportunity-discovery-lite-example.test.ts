import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileSource,
  describe,
  expect,
  mkdtempSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";
import type { NodeRunRequest } from "../src/node-runners";
import type { OpenProseRunResult } from "../src/run";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "opportunity-discovery-lite.prose.md",
);
const evalPath = join(
  import.meta.dir,
  "..",
  "examples",
  "evals",
  "north-star",
  "opportunity-discovery-lite.eval.prose.md",
);
const fixtureRoot = join(import.meta.dir, "..", "examples", "north-star", "fixtures");

describe("opportunity-discovery-lite north-star example", () => {
  test("compiles as a source-aware scan, classify, dedupe, and summary loop", () => {
    const ir = compileSource(readFileSync(examplePath, "utf8"), { path: examplePath });

    expect(ir.components.map((component) => component.name)).toEqual([
      "opportunity-discovery-lite",
      "platform-scan-reader",
      "opportunity-classifier",
      "opportunity-deduplicator",
      "opportunity-summary-writer",
    ]);
    expect(ir.components[0].ports.ensures.map((port) => port.name)).toEqual([
      "platform_scan_window",
      "opportunity_classifications",
      "opportunity_dedupe_report",
      "opportunity_summary",
    ]);
    expect(
      ir.components.find((component) => component.name === "opportunity-summary-writer")
        ?.ports.requires.map((port) => port.name),
    ).toEqual([
      "opportunity_classifications",
      "opportunity_dedupe_report",
      "brand_context",
    ]);
  });

  test("collapses duplicate cross-posts to the highest-reach fresh source and passes eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-opportunity-"));
    const result = await runOpportunity({
      runRoot,
      runId: "opportunity-accepted",
      requiredEvals: [evalPath],
      submissionsByComponent: {
        ...opportunitySubmissions("source-aware"),
        "opportunity-discovery-lite-eval": evalSubmission(true, 0.92, "pass"),
      },
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.node_records.map((record) => record.component_ref)).toEqual([
      "platform-scan-reader",
      "opportunity-classifier",
      "opportunity-deduplicator",
      "opportunity-summary-writer",
    ]);

    const window = readJsonOutput<{
      accepted_rows: Array<{ url: string; posted_at: string; reach: number }>;
      rejected_rows: Array<{ url?: string; source?: string; reason: string }>;
    }>(result, "platform_scan_window");
    expect(window.accepted_rows.map((row) => row.url)).toEqual([
      "https://news.ycombinator.com/item?id=1003",
      "https://x.example/status/1003",
    ]);
    expect(window.rejected_rows.map((row) => row.reason)).toEqual([
      "older than 7 days",
      "missing url provenance",
    ]);

    const dedupe = readJsonOutput<{
      clusters: Array<{ topic: string; winner: string; winner_reason: string }>;
    }>(result, "opportunity_dedupe_report");
    expect(dedupe.clusters[0]).toMatchObject({
      topic: "agent-audit-trails",
      winner: "https://x.example/status/1003",
      winner_reason: "highest reach among fresh duplicates",
    });

    const classifications = readJsonOutput<{
      rows: Array<{ url: string; quality_reason: string }>;
    }>(result, "opportunity_classifications");
    expect(classifications.rows.every((row) => row.url.startsWith("https://"))).toBe(true);
    expect(classifications.rows.every((row) => row.quality_reason.length > 10)).toBe(true);

    const summary = readOutput(result, "opportunity_summary");
    expect(summary).toContain("helpful answer");
    expect(summary).toContain("https://x.example/status/1003");
    expect(summary).not.toContain("Buy OpenProse");
    expect(summary).not.toContain("https://reddit.example/r/aiops/comments/old-audit-thread");
    expect(result.record.evals[0]).toMatchObject({
      eval_ref: evalPath,
      status: "passed",
      score: 0.92,
    });
  });

  test("brand-context changes reuse the scan window and rerun downstream reasoning", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-opportunity-recompute-"));
    const first = await runOpportunity({
      runRoot,
      runId: "opportunity-brand-base",
      submissionsByComponent: opportunitySubmissions("source-aware"),
    });
    const requests: string[] = [];
    const second = await runOpportunity({
      runRoot,
      runId: "opportunity-brand-recompute",
      currentRunPath: first.run_dir,
      inputs: {
        platform_scan_results: fixture(
          "opportunity-discovery-lite/duplicate-crossposts.platform-scan-results.json",
        ),
        brand_context: [
          "# Brand Context",
          "",
          "OpenProse now leads with enterprise provenance and registry adoption.",
        ].join("\n"),
      },
      targetOutputs: ["opportunity_summary"],
      submissionsByComponent: downstreamOpportunitySubmissions("enterprise"),
      onRequest: (request) => requests.push(request.component.name),
    });

    expect(second.record.status).toBe("succeeded");
    expect(requests).toEqual([
      "opportunity-classifier",
      "opportunity-deduplicator",
      "opportunity-summary-writer",
    ]);
    expect(second.plan.materialization_set.nodes).not.toContain("platform-scan-reader");
  });

  test("seeded-bad source-free promotion is rejected by the required eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-opportunity-bad-"));
    const result = await runOpportunity({
      runRoot,
      runId: "opportunity-rejected",
      inputs: {
        platform_scan_results: fixture("opportunity-discovery-lite/seeded-bad.platform-scan-results.json"),
        brand_context: fixture("opportunity-discovery-lite/happy.brand-context.md"),
      },
      requiredEvals: [evalPath],
      submissionsByComponent: {
        ...opportunitySubmissions("seeded-bad"),
        "opportunity-discovery-lite-eval": evalSubmission(
          false,
          0.18,
          "fail: stale source-free promotion",
        ),
      },
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("rejected");
    expect(result.record.evals[0]).toMatchObject({
      eval_ref: evalPath,
      status: "failed",
      score: 0.18,
    });
  });
});

async function runOpportunity(options: {
  runRoot: string;
  runId: string;
  currentRunPath?: string;
  inputs?: Record<string, string>;
  targetOutputs?: string[];
  requiredEvals?: string[];
  submissionsByComponent: Record<string, OutputSubmissionPayload>;
  onRequest?: (request: NodeRunRequest) => void;
}): Promise<OpenProseRunResult> {
  return runSource(readFileSync(examplePath, "utf8"), {
    path: examplePath,
    runRoot: options.runRoot,
    runId: options.runId,
    currentRunPath: options.currentRunPath,
    inputs: {
      platform_scan_results: fixture(
        "opportunity-discovery-lite/duplicate-crossposts.platform-scan-results.json",
      ),
      brand_context: fixture("opportunity-discovery-lite/happy.brand-context.md"),
      fixture_root: fixtureRoot,
      ...(options.inputs ?? {}),
    },
    targetOutputs: options.targetOutputs,
    requiredEvals: options.requiredEvals,
    nodeRunner: scriptedPiRuntime({
      submissionsByComponent: options.submissionsByComponent,
      onRequest: options.onRequest,
    }),
    createdAt: "2026-04-26T15:05:00.000Z",
  });
}

function opportunitySubmissions(
  variant: "source-aware" | "seeded-bad",
): Record<string, OutputSubmissionPayload> {
  if (variant === "seeded-bad") {
    return {
      "platform-scan-reader": submission({
        platform_scan_window: JSON.stringify({
          scanned_at: "2026-04-26T12:40:00Z",
          accepted_rows: [],
          rejected_rows: [
            {
              source: "unknown",
              reason: "older than 7 days and missing URL provenance",
            },
          ],
        }),
      }),
      "opportunity-classifier": submission({
        opportunity_classifications: JSON.stringify({ rows: [] }),
      }),
      "opportunity-deduplicator": submission({
        opportunity_dedupe_report: JSON.stringify({ clusters: [] }),
      }),
      "opportunity-summary-writer": submission({
        opportunity_summary: "# Opportunity Summary\n\nBuy OpenProse because AI is cool.",
      }),
    };
  }

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
    ...downstreamOpportunitySubmissions("source-aware"),
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
        "Reason: higher reach, fresh activity, and explicit workflow audit pain.",
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

function submission(outputs: Record<string, string>): OutputSubmissionPayload {
  return {
    outputs: Object.entries(outputs).map(([port, content]) => ({ port, content })),
    performed_effects: ["pure"],
  };
}

function readOutput(result: OpenProseRunResult, port: string): string {
  const output = result.record.outputs.find((candidate) => candidate.port === port);
  if (!output) {
    throw new Error(`Missing output '${port}'.`);
  }
  return readFileSync(join(result.run_dir, output.artifact_ref), "utf8");
}

function readJsonOutput<T>(result: OpenProseRunResult, port: string): T {
  return JSON.parse(readOutput(result, port)) as T;
}

function fixture(path: string): string {
  return readFileSync(join(fixtureRoot, path), "utf8");
}
