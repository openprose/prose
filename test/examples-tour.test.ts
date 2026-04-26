import {
  describe,
  expect,
  join,
  mkdtempSync,
  packagePath,
  publishCheckPath,
  readFileSync,
  runProseCli,
  test,
  tmpdir,
} from "./support";

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
      "examples-quality",
      "hello",
      "market-sync",
      "qa-check",
      "release-note-writer",
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
      "--provider",
      "fixture",
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
      "--provider",
      "fixture",
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
      "examples/company-intake.prose.md",
      "--provider",
      "fixture",
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
      "--provider",
      "fixture",
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
      "--provider",
      "fixture",
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
      "--provider",
      "fixture",
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
      "--provider",
      "fixture",
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

function expectCliSuccess(args: string[]): { stdoutText: string; stderrText: string } {
  const result = runProseCli(args);
  const stdoutText = new TextDecoder().decode(result.stdout);
  const stderrText = new TextDecoder().decode(result.stderr);
  expect(result.exitCode, stderrText || stdoutText).toBe(0);
  return { stdoutText, stderrText };
}
