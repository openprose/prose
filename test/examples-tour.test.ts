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

describe("OpenProse north-star examples", () => {
  test("the examples package compiles and passes strict publish checks", async () => {
    const metadata = await packagePath(examplesRoot);
    const publish = await publishCheckPath(examplesRoot, { strict: true });

    expect(metadata.components.map((component) => component.name).sort()).toEqual([
      "agent-crawl-batch-reader",
      "agent-crawl-target-builder",
      "agent-ecosystem-index-refresh",
      "agent-ecosystem-scorer",
      "agent-index-report-writer",
      "announce-release",
      "company-signal-brief",
      "customer-repo-planner",
      "customer-repo-preview-writer",
      "customer-repo-scaffold-preview",
      "examples-quality",
      "lead-profile-normalizer",
      "lead-program-designer",
      "lead-qualification-scorer",
      "merged-pr-auditor",
      "merged-pr-fit-review-lite",
      "opportunity-classifier",
      "opportunity-deduper",
      "opportunity-discovery-lite",
      "opportunity-summarizer",
      "pr-fit-summary-writer",
      "pr-review-memory-writer",
      "qa-check",
      "release-note-writer",
      "release-proposal-dry-run",
      "save-grow-program-drafter",
      "stargazer-digest-writer",
      "stargazer-enricher",
      "stargazer-intake-lite",
      "stargazer-memory-writer",
      "stargazer-ranker",
    ]);
    expect(metadata.manifest.examples).toEqual([
      "north-star/agent-ecosystem-index-refresh.prose.md",
      "north-star/company-signal-brief.prose.md",
      "north-star/customer-repo-scaffold-preview.prose.md",
      "north-star/lead-program-designer.prose.md",
      "north-star/merged-pr-fit-review-lite.prose.md",
      "north-star/opportunity-discovery-lite.prose.md",
      "north-star/release-proposal-dry-run.prose.md",
      "north-star/stargazer-intake-lite.prose.md",
    ]);
    expect(publish.status).toBe("pass");
    expect(publish.blockers).toEqual([]);
  });

  test("the smallest north-star service has an executable fixture smoke", () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-north-star-")), "runs");

    const result = expectCliSuccess([
      "run",
      "examples/north-star/company-signal-brief.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "company-signal-brief",
      "--input",
      "signal_notes=Customer teams want durable agent workflows.",
      "--input",
      "brand_context=OpenProse is React for agent outcomes.",
      "--output",
      "company_signal_brief=Lead with durable agent workflows.",
      "--no-pretty",
    ]);

    const summary = JSON.parse(result.stdoutText);
    expect(summary.status).toBe("succeeded");
    expect(summary.outputs).toEqual(["company_signal_brief"]);
  });

  test("lead program selective recompute only re-runs the changed downstream node", () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-lead-recompute-")), "runs");
    expectCliSuccess([
      "run",
      "examples/north-star/lead-program-designer.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "lead-program-base",
      "--input",
      'lead_profile={"company":"Acme","pain":"manual agent handoffs"}',
      "--input",
      "brand_context=OpenProse is React for agent outcomes.",
      "--output",
      'lead-profile-normalizer.lead_normalized_profile={"company":"Acme","pain":"manual agent handoffs"}',
      "--output",
      'lead-qualification-scorer.lead_qualification_score={"score":88,"confidence":"high"}',
      "--output",
      "save-grow-program-drafter.lead_program_plan=Save/Grow plan v1.",
      "--no-pretty",
    ]);

    const planResult = expectCliSuccess([
      "plan",
      "examples/north-star/lead-program-designer.prose.md",
      "--current-run",
      join(runRoot, "lead-program-base"),
      "--target-output",
      "lead_program_plan",
      "--input",
      'lead_profile={"company":"Acme","pain":"manual agent handoffs"}',
      "--input",
      "brand_context=OpenProse now emphasizes enterprise registries.",
      "--no-pretty",
    ]);
    const plan = JSON.parse(planResult.stdoutText);

    expect(plan.status).toBe("ready");
    expect(plan.materialization_set.nodes).toEqual(["save-grow-program-drafter"]);
    const scorer = (plan.nodes as Array<{ node_id: string; status: string }>).find(
      (node) => node.node_id === "lead-qualification-scorer",
    );
    expect(scorer?.status).toBe("current");
  });

  test("required evals can accept a successful subject run", () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-examples-eval-")), "runs");
    const result = expectCliSuccess([
      "run",
      "examples/north-star/company-signal-brief.prose.md",
      "--run-root",
      runRoot,
      "--run-id",
      "eval-accepted",
      "--input",
      "signal_notes=Signals.",
      "--input",
      "brand_context=Brand.",
      "--input",
      "package_root=examples",
      "--output",
      "company_signal_brief=Brief with eval acceptance.",
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

  test("release proposal gates block before effecting sessions", () => {
    const result = runProseCli([
      "plan",
      "examples/north-star/release-proposal-dry-run.prose.md",
      "--input",
      "release_candidate=v0.11.0",
      "--no-pretty",
    ]);
    const stdoutText = new TextDecoder().decode(result.stdout);
    const plan = JSON.parse(stdoutText);

    expect(result.exitCode).toBe(1);
    expect(plan.status).toBe("blocked");
    expect(plan.graph_blocked_reasons).toContain(
      "Graph effect 'human_gate' requires a gate before execution.",
    );
  });

  test("the package metadata advertises registry install inputs", async () => {
    const metadata = await packagePath(examplesRoot);

    expect(metadata.manifest.registry_ref).toBe(
      "registry://openprose/@openprose/examples@0.1.0",
    );
    expect(metadata.manifest.source.git).toBe("github.com/openprose/prose");
    expect(metadata.components.find((component) => component.name === "company-signal-brief")?.path).toBe(
      "north-star/company-signal-brief.prose.md",
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
