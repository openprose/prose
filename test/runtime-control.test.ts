import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  fixture,
  join,
  listGraphNodePointers,
  listRunAttemptRecords,
  mkdtempSync,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime, providerShouldNotRun } from "./support/scripted-pi-session";
import { approvalReleaseOutputs } from "./support/runtime-scenarios";
import { cancelRunPath, resumeRunSource, retryRunSource } from "../src/control";
import { runSource } from "../src/run";
import type { ProviderRequest, ProviderResult, RuntimeProvider } from "../src/providers";

describe("OpenProse runtime controls", () => {
  test("retries only stale failed graph nodes", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-retry-"));
    let failPolish = true;
    const calls: string[] = [];
    const provider = controlledProvider(calls, {
      review: { feedback: "Tighten the intro." },
      "fact-check": { claims: "[{\"claim\":\"All claims verified.\"}]" },
      polish: { final: "The polished draft." },
    }, (request) => request.component.name === "polish" && failPolish);

    const first = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "retry-original",
      provider,
      inputs: {
        draft: "The original draft.",
      },
      createdAt: "2026-04-25T01:00:00.000Z",
    });
    expect(first.record.status).toBe("failed");
    expect(calls).toEqual(["review", "fact-check", "polish"]);
    const failedPointers = await listGraphNodePointers(
      join(runRoot, ".prose-store"),
      "retry-original",
    );
    expect(
      failedPointers.find((pointer) => pointer.node_id === "polish"),
    ).toMatchObject({
      current_run_id: null,
      failed_run_id: "retry-original:polish",
      latest_run_id: "retry-original:polish",
    });

    calls.length = 0;
    failPolish = false;
    const retry = await retryRunSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      currentRunPath: first.run_dir,
      runRoot,
      runId: "retry-second",
      provider,
      inputs: {
        draft: "The original draft.",
      },
      createdAt: "2026-04-25T01:05:00.000Z",
    });

    expect(calls).toEqual(["polish"]);
    expect(retry.record.status).toBe("succeeded");
    expect(retry.record.caller.trigger).toBe("graph_recompute");
  });

  test("cancels a blocked run by writing a cancellation attempt", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-cancel-"));
    const sourcePath = join(
      import.meta.dir,
      "..",
      "examples",
      "north-star",
      "release-proposal-dry-run.prose.md",
    );
    const blocked = await runSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      runRoot,
      runId: "cancel-target",
      provider: providerShouldNotRun(),
      inputs: {
        release_candidate: "v1.2.3",
      },
      createdAt: "2026-04-25T01:10:00.000Z",
    });

    const control = await cancelRunPath(blocked.run_dir, {
      cancelledAt: "2026-04-25T01:11:00.000Z",
      reason: "No longer needed.",
    });

    expect(control).toMatchObject({
      run_id: "cancel-target",
      action: "cancel",
      attempt_number: 2,
    });
    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), "cancel-target");
    expect(attempts.map((attempt) => attempt.status)).toEqual(["blocked", "cancelled"]);
  });

  test("resumes a human-gated run with approval records", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-resume-"));
    const sourcePath = join(
      import.meta.dir,
      "..",
      "examples",
      "north-star",
      "release-proposal-dry-run.prose.md",
    );
    const source = readFileSync(sourcePath, "utf8");
    const blocked = await runSource(source, {
      path: sourcePath,
      runRoot,
      runId: "resume-blocked",
      provider: providerShouldNotRun(),
      inputs: {
        release_candidate: "v1.2.3",
      },
      createdAt: "2026-04-25T01:20:00.000Z",
    });

    const resumed = await resumeRunSource(source, {
      path: sourcePath,
      currentRunPath: blocked.run_dir,
      runRoot,
      runId: "resume-approved",
      provider: scriptedPiRuntime({
        outputsByComponent: approvalReleaseOutputs,
      }),
      inputs: {
        release_candidate: "v1.2.3",
      },
      approvedEffects: ["human_gate", "delivers"],
      createdAt: "2026-04-25T01:25:00.000Z",
    });

    expect(resumed.record.status).toBe("succeeded");
    expect(resumed.record.caller.trigger).toBe("human_gate");
  });
});

function controlledProvider(
  calls: string[],
  outputsByComponent: Record<string, Record<string, string>>,
  shouldFail: (request: ProviderRequest) => boolean,
): RuntimeProvider {
  return {
    kind: "pi",
    async execute(request): Promise<ProviderResult> {
      calls.push(request.component.name);
      if (shouldFail(request)) {
        return {
          provider_result_version: "0.1",
          request_id: request.request_id,
          status: "failed",
          artifacts: [],
          performed_effects: [],
          logs: { stdout: null, stderr: null, transcript: null },
          diagnostics: [
            {
              severity: "error",
              code: "controlled_failure",
              message: `${request.component.name} failed by test control.`,
            },
          ],
          session: null,
          cost: null,
          duration_ms: 0,
        };
      }

      const outputs = outputsByComponent[request.component.name] ?? {};
      return {
        provider_result_version: "0.1",
        request_id: request.request_id,
        status: "succeeded",
        artifacts: request.expected_outputs.map((output) => ({
          port: output.port,
          content: normalizeText(outputs[output.port] ?? `${request.component.name}.${output.port}`),
          content_type: "text/markdown",
          artifact_ref: null,
          content_hash: null,
          policy_labels: output.policy_labels,
        })),
        performed_effects: [],
        logs: { stdout: null, stderr: null, transcript: null },
        diagnostics: [],
        session: null,
        cost: null,
        duration_ms: 0,
      };
    },
  };
}

function normalizeText(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
