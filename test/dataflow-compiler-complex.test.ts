import {
  compilePackagePath,
  compileSource,
  describe,
  expect,
  fixturePath,
  packagePath,
  publishCheckPath,
  readFileSync,
  test,
} from "./support";

const packageRoot = fixturePath("package/dataflow-complex");
const programPath = fixturePath("package/dataflow-complex/program.prose.md");

function edgeKeys(edges: Array<{
  from: { component: string; port: string };
  to: { component: string; port: string };
}>): string[] {
  return edges.map(
    (edge) =>
      `${edge.from.component}.${edge.from.port}->${edge.to.component}.${edge.to.port}`,
  );
}

describe("OpenProse complex dataflow compiler", () => {
  test("builds a deterministic fan-out/fan-in graph for a complex program", () => {
    const source = readFileSync(programPath, "utf8");
    const ir = compileSource(source, {
      path: "fixtures/package/dataflow-complex/program.prose.md",
    });

    expect(ir.diagnostics).toEqual([]);
    expect(ir.components.map((component) => component.id)).toEqual([
      "dataflow-complex",
      "normalize-account",
      "market-research",
      "customer-research",
      "risk-review",
      "citation-pack",
      "scorecard-builder",
      "brief-writer",
      "final-assembler",
    ]);

    const edges = edgeKeys(ir.graph.edges);
    expect(edges).toEqual([
      "$caller.account_record->normalize-account.account_record",
      "$caller.research_question->market-research.research_question",
      "$caller.market_window->market-research.market_window",
      "normalize-account.normalized_account->market-research.normalized_account",
      "$caller.research_question->customer-research.research_question",
      "normalize-account.normalized_account->customer-research.normalized_account",
      "normalize-account.normalized_account->risk-review.normalized_account",
      "market-research.market_signals->risk-review.market_signals",
      "customer-research.customer_signals->risk-review.customer_signals",
      "market-research.market_signals->citation-pack.market_signals",
      "customer-research.customer_signals->citation-pack.customer_signals",
      "normalize-account.normalized_account->scorecard-builder.normalized_account",
      "market-research.market_signals->scorecard-builder.market_signals",
      "customer-research.customer_signals->scorecard-builder.customer_signals",
      "risk-review.risk_digest->scorecard-builder.risk_digest",
      "normalize-account.normalized_account->brief-writer.normalized_account",
      "scorecard-builder.scorecard->brief-writer.scorecard",
      "risk-review.risk_digest->brief-writer.risk_digest",
      "brief-writer.executive_brief->final-assembler.executive_brief",
      "scorecard-builder.scorecard->final-assembler.scorecard",
      "risk-review.risk_digest->final-assembler.risk_digest",
      "citation-pack.citation_pack->final-assembler.citation_pack",
      "final-assembler.final_brief->$return.final_brief",
      "scorecard-builder.scorecard->$return.scorecard",
      "risk-review.risk_digest->$return.risk_digest",
    ]);

    expect(edges.filter((edge) => edge.includes("normalized_account"))).toHaveLength(5);
    expect(edges.filter((edge) => edge.endsWith("->$return.scorecard"))).toHaveLength(1);
    expect(edges.filter((edge) => edge.endsWith("->$return.risk_digest"))).toHaveLength(1);
  });

  test("compiles the fixture package without package-wide program-output miswiring", async () => {
    const ir = await compilePackagePath(packageRoot);
    const diagnostics = ir.diagnostics.map((diagnostic) => diagnostic.code);

    expect(diagnostics).toEqual([]);
    expect(ir.manifest).toMatchObject({
      name: "@openprose/dataflow-complex",
      version: "0.1.0",
      runtime: {
        graph_vm: "pi",
        subagents_enabled: true,
        subagent_backend: "pi",
      },
      hosted: {
        callable: true,
        trace_available: true,
      },
    });
    expect(ir.resources.map((resource) => [resource.kind, resource.path, resource.exists])).toEqual([
      ["eval", "evals/dataflow-complex.eval.prose.md", true],
      ["example", "examples/dataflow-complex.run.json", true],
      ["schema", "schemas/account-record.schema.json", true],
      ["schema", "schemas/scorecard.schema.json", true],
      ["schema", "schemas/signals.schema.json", true],
    ]);

    const edges = edgeKeys(ir.graph.edges);
    expect(edges).toContain(
      "program--risk-review.risk_digest->program--scorecard-builder.risk_digest",
    );
    expect(edges).toContain(
      "program--scorecard-builder.scorecard->program--brief-writer.scorecard",
    );
    expect(edges).not.toContain(
      "program--dataflow-complex.scorecard->program--brief-writer.scorecard",
    );
    expect(edges).not.toContain(
      "program--dataflow-complex.risk_digest->program--scorecard-builder.risk_digest",
    );
  });

  test("package metadata and publish checks cover complex dataflow resources", async () => {
    const metadata = await packagePath(packageRoot);
    const check = await publishCheckPath(packageRoot);

    expect(check.status).toBe("pass");
    expect(metadata.quality.score).toBeGreaterThan(0.8);
    expect(metadata.components.map((component) => component.name).sort()).toEqual([
      "brief-writer",
      "citation-pack",
      "customer-research",
      "dataflow-approval-gate",
      "dataflow-complex",
      "dataflow-complex-eval",
      "dataflow-failure-mode",
      "dataflow-live-output",
      "dataflow-live-subagent",
      "final-assembler",
      "market-research",
      "normalize-account",
      "risk-review",
      "scorecard-builder",
    ]);
    expect(metadata.hosted_ingest.components.length).toBe(metadata.components.length);
  });

  test("warns rather than silently hiding ambiguous and unresolved wiring", () => {
    const ambiguous = compileSource(
      `---
name: ambiguous-demo
kind: program
---

### Services

- \`first\`
- \`second\`
- \`joiner\`

### Ensures

- \`final\`: Markdown<Final> - final output

## first

### Ensures

- \`shared\`: string - first shared output

## second

### Ensures

- \`shared\`: string - second shared output

## joiner

### Requires

- \`shared\`: string - ambiguous shared input

### Ensures

- \`final\`: Markdown<Final> - final output
`,
      { path: "fixtures/package/dataflow-complex/negative/ambiguous.prose.md" },
    );
    const unresolved = compileSource(
      `---
name: unresolved-demo
kind: program
---

### Services

- \`joiner\`

### Ensures

- \`final\`: Markdown<Final> - final output

## joiner

### Requires

- \`missing_signal\`: string - no producer exists

### Ensures

- \`final\`: Markdown<Final> - final output
`,
      { path: "fixtures/package/dataflow-complex/negative/unresolved.prose.md" },
    );

    expect(ambiguous.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "ambiguous_exact_wiring",
    );
    expect(unresolved.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "unresolved_dependency",
    );
  });
});
