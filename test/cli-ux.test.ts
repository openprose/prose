import {
  describe,
  expect,
  join,
  mkdtempSync,
  runProseCli,
  test,
  tmpdir,
} from "./support";

describe("OpenProse CLI UX", () => {
  test("help explains the runtime loop and graph VM model", () => {
    const result = runProseCli(["--help"]);
    const stdout = decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain("Core runtime loop:");
    expect(stdout).toContain("compile source/package -> plan against prior runs");
    expect(stdout).toContain("Runtime:");
    expect(stdout).toContain("meta-harness");
    expect(stdout).toContain("handoff");
    expect(stdout).toContain("OpenRouter");
    expect(stdout).toContain("--graph-vm pi");
    expect(stdout).toContain("--model-provider");
    expect(stdout).toContain("--no-persist-sessions");
    expect(stdout).not.toContain("--provider fixture");
    expect(stdout).not.toContain("prose fixture");
  });

  test("status and trace failures are actionable instead of stack dumps", () => {
    const missingPath = join(tmpdir(), "openprose-missing-run-for-cli-ux");
    const status = runProseCli(["status", missingPath]);
    const trace = runProseCli(["trace", missingPath]);

    expect(status.exitCode).toBe(1);
    expect(decode(status.stderr)).toContain("Unable to read OpenProse run status:");
    expect(decode(status.stderr)).not.toContain("at async");

    expect(trace.exitCode).toBe(1);
    expect(decode(trace.stderr)).toContain("Unable to read OpenProse run trace:");
    expect(decode(trace.stderr)).not.toContain("at async");
  });

  test("status, trace, and graph text expose acceptance and planning context", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-cli-ux-"));
    const run = runProseCli([
      "run",
      "fixtures/compiler/hello.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "cli-ux-run",
      "--output",
      "message=Hello from CLI UX.",
      "--no-pretty",
    ]);
    expect(run.exitCode).toBe(0);

    const status = runProseCli(["status", runRoot]);
    const trace = runProseCli(["trace", join(runRoot, "cli-ux-run")]);
    const graph = runProseCli([
      "graph",
      "fixtures/compiler/pipeline.prose.md",
      "--input",
      "draft=Draft",
      "--target-output",
      "final",
    ]);

    expect(status.exitCode).toBe(0);
    expect(decode(status.stdout)).toContain("reason No required evals declared.");

    expect(trace.exitCode).toBe(0);
    expect(decode(trace.stdout)).toContain(
      "Acceptance reason: No required evals declared.",
    );
    expect(decode(trace.stdout)).toContain("Attempts:");
    expect(decode(trace.stdout)).toContain("- #1: succeeded");
    expect(decode(trace.stdout)).toContain("Artifacts:");
    expect(decode(trace.stdout)).toContain("- output message:");

    expect(graph.exitCode).toBe(0);
    expect(decode(graph.stdout)).toContain("%% OpenProse graph: content-pipeline");
    expect(decode(graph.stdout)).toContain("%% requested outputs: final");
    expect(decode(graph.stdout)).toContain("stale: no_current_run");
  });

  test("rejects model providers as graph VM selections", () => {
    const result = runProseCli([
      "run",
      "fixtures/compiler/hello.prose.md",
      "--graph-vm",
      "openrouter",
      "--output",
      "message=This should not run.",
    ]);

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain(
      "is a model provider profile, not an OpenProse graph VM",
    );
  });

  test("rejects the old provider flag with graph VM vocabulary", () => {
    const result = runProseCli([
      "run",
      "fixtures/compiler/hello.prose.md",
      "--provider",
      "pi",
      "--output",
      "message=This should not run.",
    ]);

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain("--provider flag has been removed");
    expect(decode(result.stderr)).toContain("--graph-vm pi");
  });

  test("remote execute shares graph VM vocabulary with local runs", () => {
    const result = runProseCli([
      "remote",
      "execute",
      "fixtures/compiler/hello.prose.md",
      "--graph-vm",
      "openrouter",
      "--output",
      "message=This should not run.",
    ]);

    expect(result.exitCode).toBe(1);
    expect(decode(result.stderr)).toContain(
      "is a model provider profile, not an OpenProse graph VM",
    );
  });
});

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
