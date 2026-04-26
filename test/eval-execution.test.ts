import {
  describe,
  discoverPackageEvals,
  executeEvalFile,
  expect,
  fixture,
  join,
  listGraphNodePointers,
  mkdtempSync,
  readEvalResultRecords,
  runProseCli,
  runSource,
  test,
  tmpdir,
  writeFileSync,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";
import { pipelineOutputs } from "./support/runtime-scenarios";

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
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Hello from eval subject.",
        },
      }),
      createdAt: "2026-04-25T01:00:00.000Z",
    });
    const evalPath = writeEvalContract(root);

    const result = await executeEvalFile(evalPath, subject.run_dir, {
      nodeRunner: scriptedPiRuntime({
        outputs: {
          result: "{\"passed\":true,\"score\":0.92,\"verdict\":\"pass\"}",
        },
      }),
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
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Hello from eval subject.",
        },
      }),
      createdAt: "2026-04-25T01:02:00.000Z",
    });
    const evalPath = writeEvalContract(root);

    const result = await executeEvalFile(evalPath, subject.run_dir, {
      nodeRunner: scriptedPiRuntime({
        outputs: {
          result: "{\"passed\":false,\"score\":42,\"verdict\":\"fail\"}",
        },
      }),
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
      nodeRunner: scriptedPiRuntime({
        outputs: {
          message: "Hello from CLI eval subject.",
        },
      }),
      createdAt: "2026-04-25T01:04:00.000Z",
    });
    const evalPath = writeEvalContract(root);
    const result = runProseCli([
      "eval",
      evalPath,
      "--subject-run",
      subject.run_dir,
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

  test("required eval failures prevent graph current pointer updates", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-eval-gate-"));
    const evalPath = writeEvalContract(root);
    const result = await runSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot: join(root, "runs"),
      runId: "eval-gated-graph",
      nodeRunner: scriptedPiRuntime({
        outputsByComponent: {
          ...pipelineOutputs,
          "quality-eval": {
            result: "{\"passed\":false,\"score\":0.2,\"verdict\":\"fail\"}",
          },
        },
      }),
      inputs: {
        draft: "The original draft.",
      },
      requiredEvals: [evalPath],
      createdAt: "2026-04-25T01:05:00.000Z",
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance).toMatchObject({
      status: "rejected",
    });
    expect(result.record.evals).toEqual([
      expect.objectContaining({
        eval_ref: evalPath,
        required: true,
        status: "failed",
        score: 0.2,
      }),
    ]);
    const pointers = await listGraphNodePointers(root, result.run_id);
    expect(pointers.map((pointer) => pointer.current_run_id)).toEqual([
      null,
      null,
      null,
    ]);
    expect(pointers.map((pointer) => pointer.latest_run_id).sort()).toEqual([
      "eval-gated-graph:fact-check",
      "eval-gated-graph:polish",
      "eval-gated-graph:review",
    ]);
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
