import {
  describe,
  expect,
  fixture,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  readFileSync,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import { runSource } from "../src/run";

describe("scripted Pi runtime test helper", () => {
  test("materializes deterministic outputs through the Pi-shaped runtime", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-success",
      provider: scriptedPiRuntime({
        outputs: {
          message: "Hello from scripted Pi.",
        },
      }),
      createdAt: "2026-04-26T12:10:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime.worker_ref).toBe("pi");
    expect(result.provider).toBe("pi");
    expect(readFileSync(join(result.run_dir, "message.md"), "utf8")).toBe(
      "Hello from scripted Pi.\n",
    );
    const attempts = await listRunAttemptRecords(
      join(runRoot, ".prose-store"),
      "scripted-pi-success",
    );
    expect(attempts[0]?.provider_session_ref).toContain("scripted-pi-1");
  });

  test("materializes outputs submitted through the OpenProse Pi output tool", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-tool-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-tool-success",
      provider: scriptedPiRuntime({
        submission: {
          outputs: [
            {
              port: "message",
              content: "Hello from the structured output tool.",
            },
          ],
          performed_effects: ["pure"],
        },
      }),
      createdAt: "2026-04-26T12:10:30.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.effects.performed).toEqual(["pure"]);
    expect(readFileSync(join(result.run_dir, "bindings", "hello", "message.md"), "utf8")).toBe(
      "Hello from the structured output tool.\n",
    );
    expect(result.record.outputs[0]).toMatchObject({
      port: "message",
      artifact_ref: "bindings/hello/message.md",
    });
  });

  test("surfaces missing output failures like the real Pi provider", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-missing-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-missing",
      provider: scriptedPiRuntime(),
      createdAt: "2026-04-26T12:11:00.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain(
      "Provider did not write required output 'message'",
    );
  });

  test("surfaces rejected structured output submissions without falling back to files", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-tool-rejected-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "scripted-pi-tool-rejected",
      provider: scriptedPiRuntime({
        submission: {
          outputs: [],
        },
      }),
      createdAt: "2026-04-26T12:11:30.000Z",
    });

    expect(result.record.status).toBe("failed");
    expect(result.record.acceptance.reason).toContain(
      "openprose_submit_outputs did not include required output 'message'",
    );
  });

  test("surfaces model errors and timeouts as Pi diagnostics", async () => {
    const modelErrorRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-model-"));
    const modelError = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: modelErrorRoot,
      runId: "scripted-pi-model-error",
      provider: scriptedPiRuntime({
        modelError: "402 Insufficient credits.",
      }),
      createdAt: "2026-04-26T12:12:00.000Z",
    });

    expect(modelError.record.status).toBe("failed");
    expect(modelError.record.acceptance.reason).toContain("402 Insufficient credits.");

    const timeoutRoot = mkdtempSync(join(tmpdir(), "openprose-scripted-pi-timeout-"));
    const timeout = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: timeoutRoot,
      runId: "scripted-pi-timeout",
      provider: scriptedPiRuntime({
        timeout: true,
        timeoutMs: 5,
      }),
      createdAt: "2026-04-26T12:13:00.000Z",
    });

    expect(timeout.record.status).toBe("failed");
    expect(timeout.record.acceptance.reason).toContain("Pi provider timed out");
  });
});
