import { readFileSync } from "node:fs";
import {
  describe,
  expect,
  fixture,
  fixturePath,
  join,
  listRunAttemptRecords,
  mkdtempSync,
  runProseCli,
  statusPath,
  test,
  tmpdir,
} from "./support";
import { runSource } from "../src/run";

describe("OpenProse run entry point", () => {
  test("executes a single-component contract through the fixture provider", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-entry-"));
    const result = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "programmatic-run",
      provider: "fixture",
      outputs: {
        message: "Hello from prose run.",
      },
      createdAt: "2026-04-25T00:00:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.runtime).toMatchObject({
      harness: "openprose-provider",
      worker_ref: "fixture",
    });
    expect(result.record.outputs).toEqual([
      expect.objectContaining({
        port: "message",
        artifact_ref: "bindings/hello/message.md",
      }),
    ]);
    expect(
      readFileSync(join(result.run_dir, "bindings", "hello", "message.md"), "utf8"),
    ).toBe("Hello from prose run.\n");

    const attempts = await listRunAttemptRecords(join(runRoot, ".prose-store"), result.run_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      run_id: "programmatic-run",
      status: "succeeded",
    });
  });

  test("CLI runs fixture provider and writes inspectable run files", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-"));
    const result = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--provider",
      "fixture",
      "--run-root",
      runRoot,
      "--run-id",
      "cli-run",
      "--output",
      "message=Hello from CLI run.",
      "--no-pretty",
    ]);

    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(summary).toMatchObject({
      run_id: "cli-run",
      status: "succeeded",
      provider: "fixture",
      plan_status: "ready",
      outputs: ["message"],
    });

    const status = await statusPath(runRoot);
    expect(status.runs[0]).toMatchObject({
      run_id: "cli-run",
      status: "succeeded",
    });
  });

  test("CLI only defaults to fixture provider when fixture outputs are present", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-cli-default-"));
    const success = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "default-fixture-run",
      "--output",
      "message=Hello from default fixture.",
      "--no-pretty",
    ]);
    expect(success.exitCode).toBe(0);
    expect(JSON.parse(new TextDecoder().decode(success.stdout))).toMatchObject({
      provider: "fixture",
      status: "succeeded",
    });

    const blocked = runProseCli([
      "run",
      fixturePath("compiler/hello.prose.md"),
      "--run-root",
      runRoot,
      "--run-id",
      "no-provider-run",
      "--no-pretty",
    ]);
    expect(blocked.exitCode).toBe(1);
    expect(new TextDecoder().decode(blocked.stderr)).toContain(
      "No runtime provider selected.",
    );
  });
});

