import {
  compileSource,
  describe,
  expect,
  join,
  mkdtempSync,
  readFileSync,
  runSource,
  test,
  tmpdir,
} from "./support";

interface EvalCase {
  file: string;
  inputs: Record<string, string>;
  output: string;
}

const runSubject = JSON.stringify(
  {
    run_id: "subject-run",
    run_dir: "/tmp/openprose/subject-run",
    kind: "service",
    component_ref: "registry://openprose/@openprose/examples@0.11.0-dev/hello",
    status: "succeeded",
    acceptance: {
      status: "accepted",
      reason: "Fixture subject accepted.",
    },
    outputs: [
      {
        port: "message",
        artifact_ref: "artifact:subject-run:message",
        schema_status: "valid",
      },
    ],
    policy: null,
    evals: [
      {
        eval_ref: "std/evals/inspector",
        status: "passed",
        score: 0.91,
        verdict: "pass",
      },
    ],
  },
  null,
  2,
);

const secondRunSubject = JSON.stringify(
  {
    ...JSON.parse(runSubject),
    run_id: "subject-run-2",
    status: "succeeded",
  },
  null,
  2,
);

const inspection = JSON.stringify(
  {
    passed: true,
    score: 0.9,
    verdict: "pass",
    subject_run_id: "subject-run",
    flags: [],
    summary: "Fixture inspection.",
  },
  null,
  2,
);

const evalCases: EvalCase[] = [
  {
    file: "contract-grader",
    inputs: {
      subject: runSubject,
    },
    output: "grade",
  },
  {
    file: "cross-run-differ",
    inputs: {
      subjects: JSON.stringify([JSON.parse(runSubject), JSON.parse(secondRunSubject)]),
    },
    output: "comparison",
  },
  {
    file: "eval-calibrator",
    inputs: {
      subjects: JSON.stringify([
        JSON.parse(runSubject),
        JSON.parse(secondRunSubject),
        { ...JSON.parse(runSubject), run_id: "subject-run-3" },
      ]),
    },
    output: "report",
  },
  {
    file: "inspector",
    inputs: {
      subject: runSubject,
      depth: "light",
    },
    output: "inspection",
  },
  {
    file: "platform-improver",
    inputs: {
      inspection,
      symptom: "Accepted run has a missing artifact reference.",
    },
    output: "diagnosis",
  },
  {
    file: "program-improver",
    inputs: {
      inspection,
      source_tree: JSON.stringify({
        files: [
          {
            path: "hello.prose.md",
            content:
              "---\nname: hello\nkind: service\n---\n\n### Ensures\n\n- `message`: Markdown<Message> - greeting\n",
          },
        ],
      }),
    },
    output: "improvements",
  },
  {
    file: "regression-tracker",
    inputs: {
      subject: runSubject,
      program_name: "hello",
      action: "check",
    },
    output: "report",
  },
];

const staleRunVocabulary =
  /\b(state\.md|program\.md|manifest\.md|services\/|bindings|__error\.md|Press|press layer|Forme layer|run directory)\b/;

describe("OpenProse std evals", () => {
  test("eval contracts are run-store native executable tests", () => {
    for (const evalCase of evalCases) {
      const source = evalSource(evalCase.file);
      const ir = compileSource(source, { path: evalPath(evalCase.file) });
      const component = ir.components[0];
      const outputPorts = component?.ports.ensures ?? [];

      expect(source.match(staleRunVocabulary), evalCase.file).toBeNull();
      expect(source.includes("run-store") || source.includes("run store"), evalCase.file).toBe(
        true,
      );
      expect(ir.diagnostics, evalCase.file).toEqual([]);
      expect(component?.kind, evalCase.file).toBe("test");
      expect(component?.effects.map((effect) => effect.kind), evalCase.file).toEqual(["pure"]);
      expect(component?.execution?.steps.length, evalCase.file).toBeGreaterThan(0);
      expect(outputPorts.map((port) => [port.name, port.type]), evalCase.file).toEqual([
        [evalCase.output, expect.stringMatching(/^Json<.+>$/)],
      ]);
    }
  });

  test("eval contracts run through the fixture provider", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-std-evals-")), "runs");

    for (const evalCase of evalCases) {
      const result = await runSource(evalSource(evalCase.file), {
        path: evalPath(evalCase.file),
        provider: "fixture",
        runRoot,
        runId: `${evalCase.file}-smoke`,
        inputs: evalCase.inputs,
        outputs: {
          [evalCase.output]: JSON.stringify({
            passed: true,
            score: 0.88,
            verdict: "pass",
            subject_run_id: "subject-run",
          }),
        },
      });

      expect(result.record.status, evalCase.file).toBe("succeeded");
      expect(result.record.acceptance.status, evalCase.file).toBe("accepted");
    }
  });
});

function evalPath(file: string): string {
  return `packages/std/evals/${file}.prose.md`;
}

function evalSource(file: string): string {
  return readFileSync(join(import.meta.dir, "..", evalPath(file)), "utf8");
}
