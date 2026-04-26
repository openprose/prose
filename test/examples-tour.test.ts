import {
  describe,
  expect,
  join,
  mkdtempSync,
  packagePath,
  publishCheckPath,
  readFileSync,
  runProseCli,
  runSource,
  test,
  tmpdir,
} from "./support";
import { createOpenAICompatibleProvider } from "../src/providers";

const repoRoot = join(import.meta.dir, "..");
const examplesRoot = join(repoRoot, "examples");

describe("OpenProse examples capability tour", () => {
  test("the examples package compiles and passes strict publish checks", async () => {
    const metadata = await packagePath(examplesRoot);
    const publish = await publishCheckPath(examplesRoot, { strict: true });

    expect(metadata.components.map((component) => component.name).sort()).toEqual([
      "account-brief",
      "announce-release",
      "approval-gated-release",
      "brief-writer",
      "company-intake",
      "company-normalizer",
      "decision-brief-writer",
      "evidence-extractor",
      "examples-quality",
      "hello",
      "inference-decision-brief",
      "market-sync",
      "qa-check",
      "release-note-writer",
      "risk-synthesizer",
      "run-aware-brief",
      "selective-recompute",
      "signal-triage",
      "summarize",
    ]);
    expect(publish.status).toBe("pass");
    expect(publish.blockers).toEqual([]);
  });

  test("each source example has an executable fixture smoke", () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-examples-tour-")), "runs");

    expectCliSuccess([
      "run",
      "examples/hello.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "hello-tour",
      "--output",
      "message=Hello from OpenProse.",
      "--no-pretty",
    ]);

    expectCliSuccess([
      "run",
      "examples/selective-recompute.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "selective-base",
      "--input",
      "draft=A stable draft.",
      "--input",
      "company=openprose",
      "--output",
      "summarize.summary=A stable summary.",
      "--output",
      "market-sync.market_snapshot=A stable market snapshot.",
      "--no-pretty",
    ]);

    expectCliSuccess([
      "run",
      "examples/inference-decision-brief.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "inference-tour",
      "--input",
      "decision_question=Should we prioritize registry first?",
      "--input",
      "raw_signals=Registry semantics are stable. Runtime provider choice is still high-risk.",
      "--output",
      "evidence-extractor.evidence_map=Evidence map.",
      "--output",
      "risk-synthesizer.risk_register=Risk register.",
      "--output",
      "decision-brief-writer.decision_brief=Decision brief.",
      "--no-pretty",
    ]);

    expectCliSuccess([
      "run",
      "examples/company-intake.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "intake-seed",
      "--input",
      "company_domain=openprose.com",
      "--input",
      "inbound_note=Warm referral.",
      "--output",
      "company-normalizer.company_record=OpenProse profile.",
      "--output",
      "signal-triage.priority_score=High priority.",
      "--output",
      "account-brief.brief=Account brief.",
      "--no-pretty",
    ]);

    expectCliSuccess([
      "run",
      "examples/run-aware-brief.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "run-aware-tour",
      "--input",
      "company=OpenProse profile.",
      "--input",
      "subject=run:intake-seed",
      "--output",
      "brief-writer.brief=Run-aware executive brief.",
      "--no-pretty",
    ]);

    expectCliSuccess([
      "run",
      "examples/approval-gated-release.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "release-tour",
      "--input",
      "release_candidate=v0.11.0",
      "--approved-effect",
      "human_gate",
      "--approved-effect",
      "delivers",
      "--output",
      "qa-check.qa_report=QA report.",
      "--output",
      "release-note-writer.release_summary=Release notes.",
      "--output",
      "announce-release.delivery_receipt=Delivered to #releases.",
      "--no-pretty",
    ]);
  });

  test("selective recompute skips stale nodes that do not feed the target", () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-examples-selective-")), "runs");
    expectCliSuccess([
      "run",
      "examples/selective-recompute.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "selective-base",
      "--input",
      "draft=A stable draft.",
      "--input",
      "company=openprose",
      "--output",
      "summarize.summary=A stable summary.",
      "--output",
      "market-sync.market_snapshot=A stable market snapshot.",
      "--no-pretty",
    ]);

    const planResult = expectCliSuccess([
      "plan",
      "examples/selective-recompute.prose.md",
      "--current-run",
      join(runRoot, "selective-base"),
      "--target-output",
      "summary",
      "--input",
      "draft=A stable draft.",
      "--input",
      "company=openprose-enterprise",
      "--no-pretty",
    ]);
    const plan = JSON.parse(planResult.stdoutText);

    expect(plan.status).toBe("current");
    expect(plan.materialization_set.nodes).toEqual([]);
    const marketSync = (plan.nodes as Array<{ node_id: string; status: string }>).find(
      (node) => node.node_id === "market-sync",
    );
    expect(marketSync?.status).toBe("skipped");
  });

  test("required evals can accept a successful subject run", () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-examples-eval-")), "runs");
    const result = expectCliSuccess([
      "run",
      "examples/hello.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "eval-accepted",
      "--input",
      "package_root=examples",
      "--output",
      "message=Hello with eval acceptance.",
      "--output",
      'examples-quality.verdict={"passed":true,"score":0.95,"verdict":"pass"}',
      "--required-eval",
      "examples/evals/examples-quality.eval.prose.md",
      "--no-pretty",
    ]);
    const summary = JSON.parse(result.stdoutText);
    const record = JSON.parse(
      readFileSync(join(summary.run_dir, "run.json"), "utf8"),
    );

    expect(record.acceptance.status).toBe("accepted");
    expect(record.evals).toContainEqual({
      eval_ref: "examples/evals/examples-quality.eval.prose.md",
      required: true,
      status: "passed",
      eval_run_id: "eval-accepted:eval:examples-quality-eval-prose-md",
      score: 0.95,
    });
  });

  test("the inference decision graph runs through an OpenAI-compatible endpoint", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-examples-inference-")), "runs");
    const server = mockOpenAICompatibleServer();

    try {
      const result = await runSource(
        readFileSync(join(examplesRoot, "inference-decision-brief.prose.md"), "utf8"),
        {
          path: "examples/inference-decision-brief.prose.md",
          runRoot,
          runId: "model-backed-brief",
          provider: createOpenAICompatibleProvider({
            baseUrl: server.baseUrl,
            apiKey: "test-key",
            model: "test/model",
          }),
          inputs: {
            decision_question: "Should we prioritize the hosted registry before the hosted runtime?",
            raw_signals: "Registry semantics are stable. Runtime provider choice remains high risk. Local package install already works.",
          },
        },
      );

      expect(result.record.status).toBe("succeeded");
      expect(result.record.outputs.map((output) => output.port)).toEqual([
        "evidence_map",
        "risk_register",
        "decision_brief",
      ]);
      expect(
        result.record.outputs.find((output) => output.port === "decision_brief"),
      ).toBeDefined();
      expect(result.node_records.map((record) => record.component_ref)).toEqual([
        "evidence-extractor",
        "risk-synthesizer",
        "decision-brief-writer",
      ]);
      expect(server.seenPrompts()).toHaveLength(3);
      expect(server.seenPrompts()[2]).toContain("## Risk Register");
    } finally {
      server.stop();
    }
  });

  test("the package metadata advertises registry install inputs", async () => {
    const metadata = await packagePath(examplesRoot);

    expect(metadata.manifest.registry_ref).toBe(
      "registry://openprose/@openprose/examples@0.1.0",
    );
    expect(metadata.manifest.source.git).toBe("github.com/openprose/prose");
    expect(metadata.components.find((component) => component.name === "hello")?.path).toBe(
      "hello.prose.md",
    );
  });
});

function expectCliSuccess(
  args: string[],
  env: Record<string, string> = {},
): { stdoutText: string; stderrText: string } {
  const result = runProseCli(args, undefined, { env });
  const stdoutText = new TextDecoder().decode(result.stdout);
  const stderrText = new TextDecoder().decode(result.stderr);
  expect(result.exitCode, stderrText || stdoutText).toBe(0);
  return { stdoutText, stderrText };
}

function mockOpenAICompatibleServer(): {
  baseUrl: string;
  seenPrompts: () => string[];
  stop: () => void;
} {
  const prompts: string[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const body = JSON.parse(await request.text()) as {
        messages?: Array<{ content?: string }>;
      };
      const prompt = body.messages?.[1]?.content ?? "";
      prompts.push(prompt);
      return Response.json({
        id: `mock-${prompts.length}`,
        choices: [
          {
            message: {
              content: JSON.stringify({
                outputs: outputForPrompt(prompt),
                performed_effects: [],
              }),
            },
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 10,
          total_tokens: 20,
        },
      });
    },
  });

  return {
    baseUrl: `http://${server.hostname}:${server.port}/v1`,
    seenPrompts: () => prompts,
    stop: () => server.stop(true),
  };
}

function outputForPrompt(prompt: string): Record<string, string> {
  if (prompt.includes("# evidence-extractor")) {
    return {
      evidence_map: [
        "## Evidence Map",
        "- Stable: registry semantics and local package install are working.",
        "- Uncertain: runtime provider selection remains high-risk.",
      ].join("\n"),
    };
  }
  if (prompt.includes("# risk-synthesizer")) {
    return {
      risk_register: [
        "## Risk Register",
        "- Runtime interop could change provider boundaries.",
        "- Registry-first sequencing lowers product and package risk.",
      ].join("\n"),
    };
  }
  return {
    decision_brief: [
      "## Decision Brief",
      "Prioritize the hosted registry first, while keeping runtime provider experiments active behind the provider contract.",
    ].join("\n"),
  };
}
