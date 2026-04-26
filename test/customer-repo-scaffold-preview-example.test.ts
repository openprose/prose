import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import {
  compileSource,
  describe,
  expect,
  listRunAttemptRecords,
  mkdtempSync,
  packagePath,
  publishCheckPath,
  runSource,
  test,
  tmpdir,
} from "./support";
import {
  nodeRunnerShouldNotRun,
  scriptedPiRuntime,
} from "./support/scripted-pi-session";
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";
import type {
  NodeRunRequest,
  NodeRunResult,
  NodeRunner,
} from "../src/node-runners";
import type { OpenProseRunResult } from "../src/run";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "customer-repo-scaffold-preview.prose.md",
);
const evalPath = join(
  import.meta.dir,
  "..",
  "examples",
  "evals",
  "north-star",
  "customer-repo-scaffold-preview.eval.prose.md",
);
const fixtureRoot = join(import.meta.dir, "..", "examples", "north-star", "fixtures");

describe("customer-repo-scaffold-preview north-star example", () => {
  test("compiles as a pure planner plus mutating scratch preview writer", () => {
    const ir = compileSource(readFileSync(examplePath, "utf8"), { path: examplePath });

    expect(ir.components.map((component) => component.name)).toEqual([
      "customer-repo-scaffold-preview",
      "customer-repo-planner",
      "customer-repo-preview-writer",
    ]);
    expect(
      ir.components.find((component) => component.name === "customer-repo-preview-writer")
        ?.effects.map((effect) => effect.kind),
    ).toEqual(["mutates_repo"]);
  });

  test("blocks scratch mutation before Pi starts without approval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scaffold-blocked-"));
    let calls = 0;
    const result = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "scaffold-needs-approval",
      inputs: defaultInputs(),
      nodeRunner: nodeRunnerShouldNotRun(() => {
        calls += 1;
      }),
      createdAt: "2026-04-26T16:00:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("Graph effect 'mutates_repo'");
    expect(result.node_records).toEqual([]);
    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "scaffold-needs-approval",
    );
    expect(attempts[0]?.node_session_ref).toBeNull();
  });

  test("writes a package-shaped customer repo preview into the scratch workspace", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scaffold-preview-"));
    const result = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "scaffold-preview",
      inputs: defaultInputs(),
      approvedEffects: ["mutates_repo"],
      requiredEvals: [evalPath],
      nodeRunner: scaffoldRuntime({
        evalSubmission: evalSubmission(true, 0.91, "pass"),
      }),
      createdAt: "2026-04-26T16:05:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.node_records.map((record) => record.component_ref)).toEqual([
      "customer-repo-planner",
      "customer-repo-preview-writer",
    ]);
    const preview = readJsonOutput<{
      workspace_root: string;
      files: Array<{ path: string; sha256: string }>;
    }>(result, "customer_repo_preview");
    expect(preview.files.map((file) => file.path).sort()).toEqual([
      "README.md",
      "evals/intake.eval.prose.md",
      "prose.package.json",
      "responsibilities/intake.prose.md",
      "services/lead-intake.prose.md",
      "workflows/save-grow.prose.md",
    ]);
    expect(preview.files.every((file) => file.sha256.length === 64)).toBe(true);
    expect(readdirRecursive(preview.workspace_root).sort()).toEqual(
      preview.files.map((file) => file.path).sort(),
    );

    expect(
      compileSource(
        readFileSync(join(preview.workspace_root, "evals", "intake.eval.prose.md"), "utf8"),
        { path: join(preview.workspace_root, "evals", "intake.eval.prose.md") },
      ),
    ).toMatchObject({
      components: [expect.objectContaining({ name: "acme-intake-eval" })],
    });
    const generatedPackage = await packagePath(preview.workspace_root);
    const publish = await publishCheckPath(preview.workspace_root, { strict: true });
    expect(generatedPackage.components.map((component) => component.name).sort()).toEqual([
      "acme-intake-eval",
      "acme-intake-owner",
      "acme-lead-intake",
      "acme-save-grow-workflow",
    ]);
    expect(publish.status).toBe("pass");
  });

  test("refuses to overwrite an existing customer slug", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scaffold-overwrite-"));
    const result = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "scaffold-overwrite-refused",
      inputs: defaultInputs(),
      approvedEffects: ["mutates_repo"],
      nodeRunner: scaffoldRuntime({ seedExistingSlug: true }),
      createdAt: "2026-04-26T16:10:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(
      result.node_records.find((record) => record.component_ref === "customer-repo-preview-writer")
        ?.acceptance.reason,
    ).toContain("Existing customer slug");
    expect(result.record.outputs).toEqual([]);
  });

  test("seeded deprecated delivery directory output is rejected by the eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scaffold-bad-"));
    const result = await runScaffoldWithScriptedPi({
      runRoot,
      runId: "scaffold-deprecated-delivery",
      inputs: {
        lead_program_plan: fixture("customer-repo-scaffold-preview/seeded-bad.lead-program-plan.md"),
      },
      requiredEvals: [evalPath],
      submissionsByComponent: {
        "customer-repo-planner": submission({
          customer_repo_plan: JSON.stringify({
            slug: "acme-robotics",
            directories: ["delivery"],
            files: ["delivery/intro.prose.md"],
          }),
        }),
        "customer-repo-preview-writer": submission(
          {
            customer_repo_preview: JSON.stringify({
              workspace_root: "/tmp/openprose-bad-scaffold",
              files: [{ path: "delivery/intro.prose.md", sha256: "0".repeat(64) }],
            }),
          },
          ["mutates_repo"],
        ),
        "customer-repo-scaffold-preview-eval": evalSubmission(
          false,
          0.22,
          "fail: deprecated delivery path",
        ),
      },
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("rejected");
    expect(result.record.evals[0]).toMatchObject({
      status: "failed",
      score: 0.22,
    });
  });
});

async function runScaffoldWithScriptedPi(options: {
  runRoot: string;
  runId: string;
  inputs?: Record<string, string>;
  requiredEvals?: string[];
  submissionsByComponent: Record<string, OutputSubmissionPayload>;
}): Promise<OpenProseRunResult> {
  return runSource(readFileSync(examplePath, "utf8"), {
    path: examplePath,
    runRoot: options.runRoot,
    runId: options.runId,
    inputs: {
      ...defaultInputs(),
      ...(options.inputs ?? {}),
    },
    approvedEffects: ["mutates_repo"],
    requiredEvals: options.requiredEvals,
    nodeRunner: scriptedPiRuntime({
      submissionsByComponent: options.submissionsByComponent,
    }),
    createdAt: "2026-04-26T16:15:00.000Z",
  });
}

function scaffoldRuntime(options: {
  seedExistingSlug?: boolean;
  evalSubmission?: OutputSubmissionPayload;
} = {}): NodeRunner {
  return {
    kind: "pi",
    async execute(request): Promise<NodeRunResult> {
      if (request.component.name === "customer-repo-planner") {
        return nodeRunnerSuccess(request, {
          customer_repo_plan: JSON.stringify(customerRepoPlan()),
        }, ["pure"]);
      }
      if (request.component.name === "customer-repo-preview-writer") {
        const root = join(request.workspace_path, "acme-robotics");
        if (options.seedExistingSlug) {
          mkdirSync(root, { recursive: true });
        }
        if (existsSync(root)) {
          return nodeRunnerFailure(request, "Existing customer slug 'acme-robotics' was refused.");
        }
        const files = writeCustomerRepo(root);
        return nodeRunnerSuccess(request, {
          customer_repo_preview: JSON.stringify({
            workspace_root: root,
            files,
          }),
        }, ["mutates_repo"]);
      }
      if (request.component.name === "customer-repo-scaffold-preview-eval") {
        return nodeRunnerSuccess(request, payloadByPort(options.evalSubmission), ["pure"]);
      }
      return nodeRunnerFailure(request, `Unexpected component '${request.component.name}'.`);
    },
  };
}

function customerRepoPlan() {
  return {
    slug: "acme-robotics",
    directories: ["responsibilities", "services", "workflows", "evals"],
    files: [
      "README.md",
      "responsibilities/intake.prose.md",
      "services/lead-intake.prose.md",
      "workflows/save-grow.prose.md",
      "evals/intake.eval.prose.md",
      "prose.package.json",
    ],
  };
}

function writeCustomerRepo(root: string): Array<{ path: string; sha256: string; bytes: number }> {
  const files: Record<string, string> = {
    "README.md": "# Acme Robotics\n\nOpenProse customer repo preview.\n",
    "prose.package.json": `${JSON.stringify({
      name: "@acme-robotics/openprose",
      version: "0.1.0",
      registry: { catalog: "openprose" },
      description: "Customer repo preview generated by OpenProse.",
      license: "UNLICENSED",
      source: {
        git: "github.com/openprose/customer-preview",
        sha: "0000000000000000000000000000000000000000",
        subpath: ".",
      },
      examples: ["workflows/save-grow.prose.md"],
      evals: ["evals/intake.eval.prose.md"],
    }, null, 2)}\n`,
    "responsibilities/intake.prose.md": [
      "---",
      "name: acme-intake-owner",
      "kind: service",
      "---",
      "",
      "### Requires",
      "",
      "- `lead_profile`: Json<LeadProfile> - accepted lead profile",
      "",
      "### Ensures",
      "",
      "- `intake_brief`: Markdown<IntakeBrief> - scoped intake brief",
      "",
      "### Effects",
      "",
      "- `pure`: documents the intake owner responsibility",
      "",
    ].join("\n"),
    "services/lead-intake.prose.md": [
      "---",
      "name: acme-lead-intake",
      "kind: service",
      "---",
      "",
      "### Requires",
      "",
      "- `lead_profile`: Json<LeadProfile> - accepted lead profile",
      "",
      "### Ensures",
      "",
      "- `intake_brief`: Markdown<IntakeBrief> - scoped intake brief",
      "",
      "### Effects",
      "",
      "- `pure`: drafts the intake brief from declared lead data",
      "",
    ].join("\n"),
    "workflows/save-grow.prose.md": [
      "---",
      "name: acme-save-grow-workflow",
      "kind: program",
      "---",
      "",
      "### Services",
      "",
      "- `acme-lead-intake`",
      "",
      "### Requires",
      "",
      "- `lead_profile`: Json<LeadProfile> - accepted lead profile",
      "",
      "### Ensures",
      "",
      "- `intake_brief`: Markdown<IntakeBrief> - scoped intake brief",
      "",
      "### Effects",
      "",
      "- `pure`: routes lead data through the intake service",
      "",
    ].join("\n"),
    "evals/intake.eval.prose.md": [
      "---",
      "name: acme-intake-eval",
      "kind: test",
      "---",
      "",
      "### Requires",
      "",
      "- `subject`: Json<RunSubject> - materialized intake workflow",
      "",
      "### Ensures",
      "",
      "- `verdict`: Json<EvalVerdict> - pass/fail verdict",
      "",
      "### Effects",
      "",
      "- `pure`: deterministic evaluation over the generated intake workflow",
      "",
    ].join("\n"),
  };

  const previews: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
    previews.push({
      path,
      sha256: createHash("sha256").update(content).digest("hex"),
      bytes: Buffer.byteLength(content),
    });
  }
  return previews;
}

function nodeRunnerSuccess(
  request: NodeRunRequest,
  outputs: Record<string, string>,
  performedEffects: string[],
): NodeRunResult {
  return {
    node_run_result_version: "0.1",
    request_id: request.request_id,
    status: "succeeded",
    artifacts: Object.entries(outputs).map(([port, content]) => ({
      port,
      content,
      content_hash: createHash("sha256").update(content).digest("hex"),
      artifact_ref: null,
      content_type: "text/markdown",
      policy_labels: [],
    })),
    performed_effects: performedEffects,
    logs: { stdout: null, stderr: null, transcript: null },
    diagnostics: [],
    session: null,
    cost: null,
    duration_ms: 0,
  };
}

function nodeRunnerFailure(request: NodeRunRequest, message: string): NodeRunResult {
  return {
    node_run_result_version: "0.1",
    request_id: request.request_id,
    status: "failed",
    artifacts: [],
    performed_effects: [],
    logs: { stdout: null, stderr: null, transcript: null },
    diagnostics: [{ severity: "error", code: "scaffold_failed", message }],
    session: null,
    cost: null,
    duration_ms: 0,
  };
}

function payloadByPort(
  submission: OutputSubmissionPayload | undefined,
): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const output of submission?.outputs ?? []) {
    if (typeof output.content === "string") {
      payload[output.port] = output.content;
    }
  }
  return payload;
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

function readdirRecursive(root: string): string[] {
  const entries: string[] = [];
  for (const name of readdirSync(root)) {
    const absolute = join(root, name);
    if (statSync(absolute).isDirectory()) {
      entries.push(...readdirRecursive(absolute).map((path) => join(name, path)));
    } else {
      entries.push(relative(root, absolute));
    }
  }
  return entries;
}

function defaultInputs(): Record<string, string> {
  return {
    lead_normalized_profile: fixture(
      "customer-repo-scaffold-preview/happy.lead-normalized-profile.json",
    ),
    lead_program_plan: fixture("customer-repo-scaffold-preview/happy.lead-program-plan.md"),
    fixture_root: fixtureRoot,
  };
}

function fixture(path: string): string {
  return readFileSync(join(fixtureRoot, path), "utf8");
}
