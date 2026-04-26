import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";

interface NorthStarScenario {
  name: string;
  source: string;
  inputs: Record<string, string>;
  approvedEffects?: string[];
  submissionsByComponent: Record<string, OutputSubmissionPayload>;
  expectedOutputs: string[];
}

const examplesRoot = join(import.meta.dir, "..", "examples", "north-star");
const fixturesRoot = join(examplesRoot, "fixtures");

describe("OpenProse north-star scripted Pi scenarios", () => {
  test("every north-star example runs through structured Pi output submissions", async () => {
    for (const scenario of scenarios()) {
      const runRoot = mkdtempSync(join(tmpdir(), `openprose-${scenario.name}-`));
      const sourcePath = join(examplesRoot, scenario.source);
      const result = await runSource(readFileSync(sourcePath, "utf8"), {
        path: sourcePath,
        runRoot,
        runId: scenario.name,
        inputs: scenario.inputs,
        approvedEffects: scenario.approvedEffects,
        provider: scriptedPiRuntime({
          submissionsByComponent: scenario.submissionsByComponent,
        }),
        createdAt: "2026-04-26T13:30:00.000Z",
      });

      expect(result.record.status, scenario.name).toBe("succeeded");
      expect(result.record.outputs.map((output) => output.port).sort()).toEqual(
        [...scenario.expectedOutputs].sort(),
      );
      const trace = await traceFile(result.run_dir);
      const acceptedSubmissions = trace.events.filter(
        (event) => event.event === "pi.output_submission.accepted",
      );
      expect(acceptedSubmissions.length, scenario.name).toBeGreaterThanOrEqual(
        Math.max(1, result.node_records.length),
      );
      expect(renderTraceText(trace)).toContain("pi.output_submission.accepted");
    }
  });

  test("a rejected structured output submission fails without falling back to files", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-north-star-rejected-"));
    const sourcePath = join(examplesRoot, "company-signal-brief.prose.md");
    const result = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "company-signal-rejected",
      inputs: {
        signal_notes: fixture("company-signal-brief/happy.signal-notes.md"),
        brand_context: fixture("company-signal-brief/happy.brand-context.md"),
      },
      provider: scriptedPiRuntime({
        submission: {
          outputs: [],
        },
      }),
      createdAt: "2026-04-26T13:35:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain(
      "openprose_submit_outputs did not include required output 'company_signal_brief'",
    );
  });
});

function scenarios(): NorthStarScenario[] {
  return [
    {
      name: "company-signal-brief",
      source: "company-signal-brief.prose.md",
      inputs: {
        signal_notes: fixture("company-signal-brief/happy.signal-notes.md"),
        brand_context: fixture("company-signal-brief/happy.brand-context.md"),
      },
      submissionsByComponent: {
        "company-signal-brief": submission({
          company_signal_brief: "# Company Signal Brief\n\nLead with durable agent workflows.",
        }),
      },
      expectedOutputs: ["company_signal_brief"],
    },
    {
      name: "lead-program-designer",
      source: "lead-program-designer.prose.md",
      inputs: {
        lead_profile: fixture("lead-program-designer/happy.lead-profile.json"),
        brand_context: fixture("lead-program-designer/happy.brand-context.md"),
      },
      submissionsByComponent: {
        "lead-profile-normalizer": submission({
          lead_normalized_profile: JSON.stringify({
            company: "Acme Robotics",
            buyer: "VP Operations",
            pain: "Agent pilots lose provenance at handoff.",
          }),
        }),
        "lead-qualification-scorer": submission({
          lead_qualification_score: JSON.stringify({
            score: 88,
            confidence: "high",
            risks: ["needs security review"],
          }),
        }),
        "save-grow-program-drafter": submission({
          lead_program_plan: "# Save/Grow Program\n\nSave with an audit. Grow with a packaged workflow.",
        }),
      },
      expectedOutputs: [
        "lead_normalized_profile",
        "lead_qualification_score",
        "lead_program_plan",
      ],
    },
    {
      name: "stargazer-intake-lite",
      source: "stargazer-intake-lite.prose.md",
      inputs: {
        stargazer_batch: fixture("stargazer-intake-lite/duplicate-high-water.stargazer-batch.json"),
        prior_stargazer_memory: fixture("stargazer-intake-lite/happy.prior-stargazer-memory.json"),
      },
      approvedEffects: ["writes_memory"],
      submissionsByComponent: {
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
            rows: [{ login: "ops-builder", rank: 1, reason: "agent platform signal" }],
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
            }),
          },
          ["writes_memory"],
        ),
        "stargazer-digest-writer": submission({
          stargazer_digest: "# Stargazer Digest\n\nFollow up with ops-builder.",
        }),
      },
      expectedOutputs: [
        "stargazer_batch_delta",
        "prioritized_stargazers",
        "stargazer_enrichment_records",
        "stargazer_memory_delta",
        "stargazer_digest",
      ],
    },
    {
      name: "opportunity-discovery-lite",
      source: "opportunity-discovery-lite.prose.md",
      inputs: {
        platform_scan_results: fixture(
          "opportunity-discovery-lite/duplicate-crossposts.platform-scan-results.json",
        ),
        brand_context: fixture("opportunity-discovery-lite/happy.brand-context.md"),
      },
      submissionsByComponent: {
        "opportunity-classifier": submission({
          opportunity_classifications: JSON.stringify({
            rows: [{ canonical_topic: "agent-audit-trails", relevance: "high" }],
          }),
        }),
        "opportunity-deduper": submission({
          opportunity_dedupe_report: JSON.stringify({
            clusters: [{ topic: "agent-audit-trails", winner: "https://x.example/status/1003" }],
          }),
        }),
        "opportunity-summarizer": submission({
          opportunity_summary: "# Opportunity Summary\n\nPrioritize the audit-trails thread.",
        }),
      },
      expectedOutputs: [
        "opportunity_classifications",
        "opportunity_dedupe_report",
        "opportunity_summary",
      ],
    },
    {
      name: "release-proposal-dry-run",
      source: "release-proposal-dry-run.prose.md",
      inputs: {
        release_candidate: fixture("release-proposal-dry-run/release-needed.release-candidate.json"),
      },
      approvedEffects: ["human_gate", "delivers"],
      submissionsByComponent: {
        "qa-check": submission({
          qa_report: "# QA Report\n\nTypecheck and tests passed.",
        }),
        "release-note-writer": submission({
          release_summary: "# Release Summary\n\nNorth-star examples are ready.",
        }),
        "announce-release": submission(
          {
            delivery_receipt: "Delivered to #releases as a dry run.",
          },
          ["human_gate", "delivers"],
        ),
      },
      expectedOutputs: ["qa_report", "release_summary", "delivery_receipt"],
    },
    {
      name: "customer-repo-scaffold-preview",
      source: "customer-repo-scaffold-preview.prose.md",
      inputs: {
        lead_normalized_profile: fixture(
          "customer-repo-scaffold-preview/happy.lead-normalized-profile.json",
        ),
        lead_program_plan: fixture("customer-repo-scaffold-preview/happy.lead-program-plan.md"),
      },
      approvedEffects: ["mutates_repo"],
      submissionsByComponent: {
        "customer-repo-planner": submission({
          customer_repo_plan: JSON.stringify({
            directories: ["responsibilities", "services", "workflows", "evals"],
          }),
        }),
        "customer-repo-preview-writer": submission(
          {
            customer_repo_preview: JSON.stringify({
              files: ["responsibilities/intake.prose.md", "evals/intake.eval.prose.md"],
            }),
          },
          ["mutates_repo"],
        ),
      },
      expectedOutputs: ["customer_repo_plan", "customer_repo_preview"],
    },
    {
      name: "agent-ecosystem-index-refresh",
      source: "agent-ecosystem-index-refresh.prose.md",
      inputs: {
        agent_platform_seed_list: fixture(
          "agent-ecosystem-index-refresh/happy.agent-platform-seed-list.json",
        ),
        agent_index_policy: fixture("agent-ecosystem-index-refresh/happy.agent-index-policy.md"),
      },
      submissionsByComponent: {
        "agent-crawl-target-builder": submission({
          agent_crawl_targets: JSON.stringify({
            targets: ["https://pi.dev", "https://opencode.ai"],
          }),
        }),
        "agent-crawl-batch-reader": submission(
          {
            agent_crawl_batches: JSON.stringify({
              rows: [{ name: "Pi SDK", url: "https://pi.dev", status: "active" }],
            }),
          },
          ["read_external"],
        ),
        "agent-ecosystem-scorer": submission({
          agent_ecosystem_index: JSON.stringify({
            rows: [{ name: "Pi SDK", security_posture: "cited", url: "https://pi.dev" }],
          }),
        }),
        "agent-index-report-writer": submission({
          agent_index_report: "# Agent Ecosystem Index\n\nPi SDK is the default graph VM.",
        }),
      },
      expectedOutputs: [
        "agent_crawl_targets",
        "agent_crawl_batches",
        "agent_ecosystem_index",
        "agent_index_report",
      ],
    },
    {
      name: "merged-pr-fit-review-lite",
      source: "merged-pr-fit-review-lite.prose.md",
      inputs: {
        merged_pr_batch: fixture("merged-pr-fit-review-lite/happy.merged-pr-batch.json"),
        prior_review_memory: fixture("merged-pr-fit-review-lite/happy.prior-review-memory.json"),
      },
      approvedEffects: ["writes_memory"],
      submissionsByComponent: {
        "merged-pr-auditor": submission({
          pr_review_findings: JSON.stringify({
            rows: [{ pr: 42, status: "fits", file: "src/runtime/pi/output-tool.ts" }],
          }),
        }),
        "pr-review-memory-writer": submission(
          {
            pr_memory_delta: JSON.stringify({
              reviewed_pr_numbers: [42, 43],
            }),
          },
          ["writes_memory"],
        ),
        "pr-fit-summary-writer": submission({
          pr_fit_summary: "# PR Fit Summary\n\nStructured output and telemetry changes fit.",
        }),
      },
      expectedOutputs: ["pr_review_findings", "pr_memory_delta", "pr_fit_summary"],
    },
  ];
}

function fixture(path: string): string {
  return readFileSync(join(fixturesRoot, path), "utf8");
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
