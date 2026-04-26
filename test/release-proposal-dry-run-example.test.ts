import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  compileSource,
  describe,
  expect,
  listRunAttemptRecords,
  mkdtempSync,
  renderTraceText,
  runSource,
  test,
  tmpdir,
  traceFile,
} from "./support";
import {
  providerShouldNotRun,
  scriptedPiRuntime,
} from "./support/scripted-pi-session";
import type { OutputSubmissionPayload } from "../src/runtime/output-submission";
import type { ProviderRequest } from "../src/providers";
import type { OpenProseRunResult } from "../src/run";

const examplePath = join(
  import.meta.dir,
  "..",
  "examples",
  "north-star",
  "release-proposal-dry-run.prose.md",
);
const evalPath = join(
  import.meta.dir,
  "..",
  "examples",
  "evals",
  "north-star",
  "release-proposal-dry-run.eval.prose.md",
);
const fixtureRoot = join(import.meta.dir, "..", "examples", "north-star", "fixtures");

describe("release-proposal-dry-run north-star example", () => {
  test("compiles with a pure decision node before gated delivery", () => {
    const ir = compileSource(readFileSync(examplePath, "utf8"), { path: examplePath });

    expect(ir.components.map((component) => component.name)).toEqual([
      "release-proposal-dry-run",
      "release-decision-check",
      "qa-check",
      "release-note-writer",
      "announce-release",
    ]);
    expect(ir.components[0].ports.ensures.map((port) => port.name)).toEqual([
      "release_decision",
      "qa_report",
      "release_summary",
      "delivery_receipt",
    ]);
    expect(
      ir.components.find((component) => component.name === "announce-release")
        ?.effects.map((effect) => effect.kind),
    ).toEqual(["human_gate", "delivers"]);
  });

  test("release-needed path blocks before any Pi session without approval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-release-blocked-"));
    let calls = 0;
    const result = await runSource(readFileSync(examplePath, "utf8"), {
      path: examplePath,
      runRoot,
      runId: "release-needs-approval",
      inputs: {
        release_candidate: fixture("release-proposal-dry-run/release-needed.release-candidate.json"),
      },
      provider: providerShouldNotRun(() => {
        calls += 1;
      }),
      createdAt: "2026-04-26T15:40:00.000Z",
    });

    expect(calls).toBe(0);
    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain("Graph effect 'human_gate'");
    expect(result.node_records).toEqual([]);
    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "release-needs-approval",
    );
    expect(attempts[0]?.provider_session_ref).toBeNull();
    const trace = await traceFile(result.run_dir);
    expect(renderTraceText(trace)).toContain("gate[effect_approval]");
  });

  test("release-needed path proceeds with approval and passes eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-release-approved-"));
    const requests: ProviderRequest[] = [];
    const result = await runRelease({
      runRoot,
      runId: "release-approved",
      approvedEffects: ["human_gate", "delivers"],
      requiredEvals: [evalPath],
      submissionsByComponent: {
        ...releaseSubmissions("release-needed"),
        "release-proposal-dry-run-eval": evalSubmission(true, 0.9, "pass"),
      },
      onRequest: (request) => requests.push(request),
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.node_records.map((record) => record.component_ref)).toEqual([
      "release-decision-check",
      "qa-check",
      "release-note-writer",
      "announce-release",
    ]);
    expect(result.record.outputs.map((output) => output.port).sort()).toEqual([
      "delivery_receipt",
      "qa_report",
      "release_decision",
      "release_summary",
    ]);
    expect(
      requests.find((request) => request.component.name === "announce-release")?.approved_effects,
    ).toEqual(["delivers", "human_gate"]);
    expect(result.record.evals[0]).toMatchObject({
      eval_ref: evalPath,
      status: "passed",
      score: 0.9,
    });
    const trace = await traceFile(result.run_dir);
    expect(trace.events.find((event) => event.event === "graph.started")).toMatchObject({
      approval_records: expect.arrayContaining([
        expect.objectContaining({ status: "approved", effects: ["human_gate"] }),
        expect.objectContaining({ status: "approved", effects: ["delivers"] }),
      ]),
    });
  });

  test("no-op release targets only the decision and skips the gated branch", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-release-noop-"));
    const requests: string[] = [];
    const result = await runRelease({
      runRoot,
      runId: "release-not-required",
      inputs: {
        release_candidate: fixture("release-proposal-dry-run/no-op.release-candidate.json"),
      },
      targetOutputs: ["release_decision"],
      submissionsByComponent: {
        "release-decision-check": submission({
          release_decision: JSON.stringify({
            release_required: false,
            status: "not_required",
            gate_required: false,
            reason: "No user-visible changes.",
          }),
        }),
      },
      onRequest: (request) => requests.push(request.component.name),
    });

    expect(result.record.status).toBe("succeeded");
    expect(requests).toEqual(["release-decision-check"]);
    expect(result.record.outputs.map((output) => output.port)).toEqual(["release_decision"]);
    expect(readJsonOutput<{ status: string; release_required: boolean }>(
      result,
      "release_decision",
    )).toMatchObject({
      status: "not_required",
      release_required: false,
    });
  });

  test("fabricated commit ranges are rejected by the required eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-release-bad-sha-"));
    const result = await runRelease({
      runRoot,
      runId: "release-fabricated-sha",
      inputs: {
        release_candidate: fixture("release-proposal-dry-run/seeded-bad.release-candidate.json"),
      },
      approvedEffects: ["human_gate", "delivers"],
      requiredEvals: [evalPath],
      submissionsByComponent: {
        ...releaseSubmissions("fabricated-sha"),
        "release-proposal-dry-run-eval": evalSubmission(
          false,
          0.12,
          "fail: fabricated commit range",
        ),
      },
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("rejected");
    expect(result.record.evals[0]).toMatchObject({
      status: "failed",
      score: 0.12,
    });
  });

  test("low changelog coverage is rejected by the required eval", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-release-low-coverage-"));
    const result = await runRelease({
      runRoot,
      runId: "release-low-coverage",
      inputs: {
        release_candidate: fixture("release-proposal-dry-run/low-coverage.release-candidate.json"),
      },
      approvedEffects: ["human_gate", "delivers"],
      requiredEvals: [evalPath],
      submissionsByComponent: {
        ...releaseSubmissions("low-coverage"),
        "release-proposal-dry-run-eval": evalSubmission(
          false,
          0.31,
          "fail: low changelog coverage",
        ),
      },
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("rejected");
    expect(result.record.evals[0]).toMatchObject({
      status: "failed",
      score: 0.31,
    });
  });

  test("delivery fails when it reports an undeclared performed effect", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-release-undeclared-effect-"));
    const result = await runRelease({
      runRoot,
      runId: "release-undeclared-effect",
      approvedEffects: ["human_gate", "delivers", "mutates_repo"],
      submissionsByComponent: {
        ...releaseSubmissions("release-needed"),
        "announce-release": submission(
          {
            delivery_receipt: "Dry-run delivery recorded for #releases.",
          },
          ["human_gate", "delivers", "mutates_repo"],
        ),
      },
    });

    expect(result.record.status).toBe("failed");
    expect(
      result.node_records.find((record) => record.component_ref === "announce-release")
        ?.acceptance.reason,
    ).toContain("openprose_submit_outputs reported undeclared effect 'mutates_repo'");
    expect(result.record.outputs).toEqual([]);
  });
});

async function runRelease(options: {
  runRoot: string;
  runId: string;
  inputs?: Record<string, string>;
  targetOutputs?: string[];
  approvedEffects?: string[];
  requiredEvals?: string[];
  submissionsByComponent: Record<string, OutputSubmissionPayload>;
  onRequest?: (request: ProviderRequest) => void;
}): Promise<OpenProseRunResult> {
  return runSource(readFileSync(examplePath, "utf8"), {
    path: examplePath,
    runRoot: options.runRoot,
    runId: options.runId,
    inputs: {
      release_candidate: fixture("release-proposal-dry-run/release-needed.release-candidate.json"),
      fixture_root: fixtureRoot,
      ...(options.inputs ?? {}),
    },
    targetOutputs: options.targetOutputs,
    approvedEffects: options.approvedEffects,
    requiredEvals: options.requiredEvals,
    provider: scriptedPiRuntime({
      submissionsByComponent: options.submissionsByComponent,
      onRequest: options.onRequest,
    }),
    createdAt: "2026-04-26T15:45:00.000Z",
  });
}

function releaseSubmissions(
  variant: "release-needed" | "fabricated-sha" | "low-coverage",
): Record<string, OutputSubmissionPayload> {
  const bad = variant !== "release-needed";
  return {
    "release-decision-check": submission({
      release_decision: JSON.stringify({
        release_required: true,
        status: bad ? "invalid" : "ready_for_approval",
        candidate_valid: !bad,
        gate_required: true,
        reason: bad
          ? variant === "fabricated-sha"
            ? "Fabricated commit range cannot be verified."
            : "Release coverage is too low."
          : "User-visible changes need release manager approval.",
      }),
    }),
    "qa-check": submission({
      qa_report: [
        "# QA Report",
        "",
        variant === "low-coverage"
          ? "Typecheck passed, but tests were not run."
          : "Typecheck and tests passed.",
        "Rollback: revert the release commit range.",
      ].join("\n"),
    }),
    "release-note-writer": submission({
      release_summary: [
        "# Release Summary",
        "",
        bad
          ? "Candidate is not ready for release."
          : "Release 0.12.0 includes the north-star example ladder and Pi telemetry.",
        "Coverage: typecheck pass; tests pass.",
        "Rollback: revert 121ff04..HEAD.",
      ].join("\n"),
    }),
    "announce-release": submission(
      {
        delivery_receipt: "Dry-run delivery recorded for #releases.",
      },
      ["human_gate", "delivers"],
    ),
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
