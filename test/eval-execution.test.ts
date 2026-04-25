import {
  describe,
  discoverPackageEvals,
  executeEvalFile,
  expect,
  fixture,
  join,
  mkdtempSync,
  readEvalResultRecords,
  runProseCli,
  runSource,
  test,
  tmpdir,
  writeFileSync,
} from "./support";

describe("OpenProse executable evals", () => {
  test("discovers eval files from package metadata", async () => {
    const evals = await discoverPackageEvals(join(import.meta.dir, "..", "examples"));

    expect(evals.map((evalRef) => evalRef.eval_ref)).toContain(
      "evals/examples-quality.eval.prose.md",
    );
    expect(evals[0]?.component_ids.length).toBeGreaterThan(0);
  });

  test("executes an eval against a materialized run and records a passing score", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-eval-pass-"));
    const subject = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: join(root, "runs"),
      runId: "subject-run",
      provider: "fixture",
      outputs: {
        message: "Hello from eval subject.",
      },
      createdAt: "2026-04-25T01:00:00.000Z",
    });
    const evalPath = writeEvalContract(root);

    const result = await executeEvalFile(evalPath, subject.run_dir, {
      provider: "fixture",
      outputs: {
        result: "{\"passed\":true,\"score\":0.92,\"verdict\":\"pass\"}",
      },
      createdAt: "2026-04-25T01:01:00.000Z",
    });

    expect(result.eval_record).toMatchObject({
      subject_run_id: "subject-run",
      status: "passed",
      score: 0.92,
      verdict: "pass",
    });
    expect(result.eval_run.record.inputs[0]?.port).toBe("subject");
    expect(result.eval_run.record.status).toBe("succeeded");
    expect(await readEvalResultRecords(subject.run_dir)).toHaveLength(1);
  });

  test("records failed eval scores without mutating the subject run", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-eval-fail-"));
    const subject = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: join(root, "runs"),
      runId: "failing-subject",
      provider: "fixture",
      outputs: {
        message: "Hello from eval subject.",
      },
      createdAt: "2026-04-25T01:02:00.000Z",
    });
    const evalPath = writeEvalContract(root);

    const result = await executeEvalFile(evalPath, subject.run_dir, {
      provider: "fixture",
      outputs: {
        result: "{\"passed\":false,\"score\":42,\"verdict\":\"fail\"}",
      },
      createdAt: "2026-04-25T01:03:00.000Z",
    });

    expect(result.eval_record.status).toBe("failed");
    expect(result.eval_record.score).toBe(0.42);
    expect(subject.record.evals).toEqual([]);
    expect((await readEvalResultRecords(subject.run_dir))[0]).toMatchObject({
      subject_run_id: "failing-subject",
      status: "failed",
    });
  });

  test("CLI executes an eval against a subject run", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-eval-cli-"));
    const subject = await runSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot: join(root, "runs"),
      runId: "cli-subject",
      provider: "fixture",
      outputs: {
        message: "Hello from CLI eval subject.",
      },
      createdAt: "2026-04-25T01:04:00.000Z",
    });
    const evalPath = writeEvalContract(root);
    const result = runProseCli([
      "eval",
      evalPath,
      "--subject-run",
      subject.run_dir,
      "--provider",
      "fixture",
      "--output",
      "result={\"passed\":true,\"score\":0.81,\"verdict\":\"pass\"}",
      "--no-pretty",
    ]);

    expect(result.exitCode).toBe(0);
    const summary = JSON.parse(new TextDecoder().decode(result.stdout));
    expect(summary).toMatchObject({
      subject_run_id: "cli-subject",
      status: "passed",
      score: 0.81,
    });
  });
});

function writeEvalContract(root: string): string {
  const path = join(root, "quality.eval.prose.md");
  writeFileSync(
    path,
    `---
name: quality-eval
kind: program
---

### Requires

- \`subject\`: Json<RunSubject> - subject run payload

### Ensures

- \`result\`: Json<EvalResult> - JSON with passed, score, and verdict

### Effects

- \`pure\`: deterministic evaluation over subject payload
`,
  );
  return path;
}
