import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describe,
  expect,
  listRunAttemptRecords,
  mkdtempSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";
import type { NodeRunRequest } from "../src/node-runners";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "lead-program-designer.prose.md",
);
const evalPath = join(
  import.meta.dir,
  "..",
  "examples",
  "evals",
  "north-star",
  "lead-program-designer.eval.prose.md",
);
const fixtureRoot = join(import.meta.dir, "..", "examples", "north-star", "fixtures");

describe("lead-program-designer north-star example", () => {
  test("first run creates one Pi session per graph node and passes eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-lead-program-"));
    const prompts = new Map<string, string>();
    const result = await runLeadProgram({
      runRoot,
      runId: "lead-program-accepted",
      submissionsByComponent: {
        ...leadProgramSubmissions("v1"),
        "lead-program-designer-eval": evalSubmission(true, 0.91, "pass"),
      },
      requiredEvals: [evalPath],
      onPrompt: (prompt, request) => prompts.set(request.component.name, prompt),
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.node_records.map((record) => record.component_ref)).toEqual([
      "lead-profile-normalizer",
      "lead-qualification-scorer",
      "save-grow-program-drafter",
    ]);
    expect(result.record.evals[0]).toMatchObject({
      eval_ref: evalPath,
      status: "passed",
      score: 0.91,
    });
    for (const component of [
      "lead-profile-normalizer",
      "lead-qualification-scorer",
      "save-grow-program-drafter",
    ]) {
      const attempts = await listRunAttemptRecords(
        join(runRoot, ".prose-store"),
        `lead-program-accepted:${component}`,
      );
      expect(attempts[0]?.node_session_ref, component).toContain("scripted-pi");
    }
    expect(prompts.get("lead-qualification-scorer")).toContain("lead_normalized_profile");
    expect(prompts.get("lead-qualification-scorer")).toContain("Acme Robotics");
    expect(prompts.get("save-grow-program-drafter")).toContain("lead_qualification_score");
    expect(prompts.get("save-grow-program-drafter")).toContain("88");
    expect(prompts.get("save-grow-program-drafter")).toContain("brand_context");
  });

  test("brand-context changes re-run only the program drafter", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-lead-brand-recompute-"));
    const base = await runLeadProgram({
      runRoot,
      runId: "lead-brand-base",
      submissionsByComponent: leadProgramSubmissions("v1"),
    });
    const requests: string[] = [];
    const recompute = await runLeadProgram({
      runRoot,
      runId: "lead-brand-recompute",
      currentRunPath: base.run_dir,
      inputs: {
        lead_profile: fixture("lead-program-designer/happy.lead-profile.json"),
        brand_context: fixture("lead-program-designer/stale.brand-context.md"),
      },
      targetOutputs: ["lead_program_plan"],
      submissionsByComponent: {
        "save-grow-program-drafter": submission({
          lead_program_plan: "# Save/Grow Program\n\nUpdated for enterprise registry positioning.",
        }),
      },
      onRequest: (request) => requests.push(request.component.name),
    });

    expect(recompute.record.status).toBe("succeeded");
    expect(requests).toEqual(["save-grow-program-drafter"]);
    expect(recompute.plan.materialization_set.nodes).toEqual([
      "save-grow-program-drafter",
    ]);
  });

  test("lead-profile changes invalidate the full downstream chain", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-lead-profile-recompute-"));
    const base = await runLeadProgram({
      runRoot,
      runId: "lead-profile-base",
      submissionsByComponent: leadProgramSubmissions("v1"),
    });
    const requests: string[] = [];
    const recompute = await runLeadProgram({
      runRoot,
      runId: "lead-profile-recompute",
      currentRunPath: base.run_dir,
      inputs: {
        lead_profile: JSON.stringify({
          company: "Acme Robotics",
          domain: "acme-robotics.example",
          buyer: "Chief AI Officer",
          pain: "Agent workflows cannot be audited after production incidents.",
        }),
        brand_context: fixture("lead-program-designer/happy.brand-context.md"),
      },
      targetOutputs: ["lead_program_plan"],
      submissionsByComponent: leadProgramSubmissions("v2"),
      onRequest: (request) => requests.push(request.component.name),
    });

    expect(recompute.record.status).toBe("succeeded");
    expect(requests).toEqual([
      "lead-profile-normalizer",
      "lead-qualification-scorer",
      "save-grow-program-drafter",
    ]);
  });

  test("generic Save/Grow plan is rejected by the required eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-lead-generic-"));
    const result = await runLeadProgram({
      runRoot,
      runId: "lead-program-rejected",
      submissionsByComponent: {
        ...leadProgramSubmissions("generic"),
        "save-grow-program-drafter": submission({
          lead_program_plan: "Send a friendly email. Talk about AI. Follow up later.",
        }),
        "lead-program-designer-eval": evalSubmission(
          false,
          0.24,
          "fail: generic program draft",
        ),
      },
      requiredEvals: [evalPath],
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("rejected");
    expect(result.record.evals[0]).toMatchObject({
      eval_ref: evalPath,
      status: "failed",
      score: 0.24,
    });
  });
});

async function runLeadProgram(options: {
  runRoot: string;
  runId: string;
  currentRunPath?: string;
  inputs?: Record<string, string>;
  targetOutputs?: string[];
  submissionsByComponent: Record<string, OutputSubmissionPayload>;
  requiredEvals?: string[];
  onRequest?: (request: NodeRunRequest) => void;
  onPrompt?: (prompt: string, request: NodeRunRequest) => void;
}) {
  return runSource(readFileSync(examplePath, "utf8"), {
    path: examplePath,
    runRoot: options.runRoot,
    runId: options.runId,
    currentRunPath: options.currentRunPath,
    inputs: {
      lead_profile: fixture("lead-program-designer/happy.lead-profile.json"),
      brand_context: fixture("lead-program-designer/happy.brand-context.md"),
      fixture_root: fixtureRoot,
      ...(options.inputs ?? {}),
    },
    targetOutputs: options.targetOutputs,
    requiredEvals: options.requiredEvals,
    nodeRunner: scriptedPiRuntime({
      submissionsByComponent: options.submissionsByComponent,
      onRequest: options.onRequest,
      onPrompt: options.onPrompt,
    }),
    createdAt: "2026-04-26T14:20:00.000Z",
  });
}

function leadProgramSubmissions(version: "v1" | "v2" | "generic"): Record<string, OutputSubmissionPayload> {
  const buyer = version === "v2" ? "Chief AI Officer" : "VP Operations";
  const plan = version === "generic"
    ? "Send a friendly email. Talk about AI. Follow up later."
    : [
        "# Save/Grow Program",
        "",
        "## Save",
        "",
        `Run a provenance audit with ${buyer} to map agent handoffs.`,
        "",
        "## Grow",
        "",
        "Package the highest-value workflow into an OpenProse component with evals and gates.",
      ].join("\n");
  return {
    "lead-profile-normalizer": submission({
      lead_normalized_profile: JSON.stringify({
        company: "Acme Robotics",
        buyer,
        pain: "Agent pilots lose provenance at handoff.",
      }),
    }),
    "lead-qualification-scorer": submission({
      lead_qualification_score: JSON.stringify({
        score: version === "v2" ? 91 : 88,
        confidence: "high",
        risks: ["security review required"],
      }),
    }),
    "save-grow-program-drafter": submission({
      lead_program_plan: plan,
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

function fixture(path: string): string {
  return readFileSync(join(fixtureRoot, path), "utf8");
}
