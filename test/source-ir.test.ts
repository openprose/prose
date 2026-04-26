import {
  buildArtifactManifest,
  buildRegistryRef,
  buildTextMateGrammar,
  compileFixture,
  compileSource,
  describe,
  executeRemoteFile,
  expect,
  fixture,
  fixturePath,
  formatPath,
  formatSource,
  graphSource,
  highlightSource,
  installRegistryRef,
  installWorkspaceDependencies,
  join,
  lintPath,
  lintSource,
  materializeSource,
  mkdirSync,
  mkdtempSync,
  packagePath,
  parseRegistryRef,
  planSource,
  preflightPath,
  projectManifest,
  publishCheckPath,
  readFileSync,
  renderCatalogSearchText,
  renderFormatCheckText,
  renderGraphMermaid,
  renderHighlightHtml,
  renderHighlightText,
  renderLintReportText,
  renderLintText,
  renderPackageText,
  renderPreflightText,
  renderPublishCheckText,
  renderStatusText,
  renderTextMateGrammar,
  renderTraceText,
  runGit,
  searchCatalog,
  statusPath,
  test,
  tmpdir,
  traceFile,
  writeFileSync,
} from "./support";

describe("OpenProse source and IR", () => {
  test("compiles a single service to IR", () => {
    const ir = compileFixture("hello.prose.md");

    expect(ir.ir_version).toBe("0.1");
    expect(ir.package.name).toBe("hello");
    expect(ir.components).toHaveLength(1);
    expect(ir.components[0].kind).toBe("service");
    expect(ir.components[0].ports.ensures[0]).toMatchObject({
      name: "message",
      type: "Markdown<Greeting>",
      direction: "output",
      required: true,
    });
    expect(ir.components[0].effects[0]).toMatchObject({ kind: "pure" });
    expect(ir.diagnostics).toEqual([]);
  });

  test("builds exact graph edges for inline pipeline components", () => {
    const ir = compileFixture("pipeline.prose.md");
    const edges = ir.graph.edges.map(
      (edge) =>
        `${edge.from.component}.${edge.from.port}->${edge.to.component}.${edge.to.port}`,
    );

    expect(ir.components.map((component) => component.id)).toEqual([
      "content-pipeline",
      "review",
      "fact-check",
      "polish",
    ]);
    expect(edges).toContain("$caller.draft->review.draft");
    expect(edges).toContain("$caller.draft->fact-check.draft");
    expect(edges).toContain("$caller.draft->polish.draft");
    expect(edges).toContain("review.feedback->polish.feedback");
    expect(edges).toContain("fact-check.claims->polish.claims");
    expect(edges).toContain("polish.final->$return.final");
    expect(ir.diagnostics).toEqual([]);
  });

  test("does not use program ensures as producers for service graph inputs", () => {
    const ir = compileSource(
      `---
name: company-intake
kind: program
---

### Services

- \`company-normalizer\`
- \`account-brief\`

### Requires

- \`company_domain\`: string - company domain

### Ensures

- \`company_record\`: CompanyProfile - normalized profile returned by the graph
- \`brief\`: Markdown<AccountBrief> - brief returned by the graph

## company-normalizer

### Requires

- \`company_domain\`: string - company domain

### Ensures

- \`company_record\`: CompanyProfile - normalized profile

## account-brief

### Requires

- \`company_record\`: CompanyProfile - normalized profile

### Ensures

- \`brief\`: Markdown<AccountBrief> - account brief
`,
      { path: "fixtures/compiler/program-output-producer.prose.md" },
    );
    const edges = ir.graph.edges.map(
      (edge) =>
        `${edge.from.component}.${edge.from.port}->${edge.to.component}.${edge.to.port}`,
    );

    expect(edges).toContain(
      "company-normalizer.company_record->account-brief.company_record",
    );
    expect(edges).not.toContain(
      "company-intake.company_record->account-brief.company_record",
    );
    expect(edges).toContain("company-normalizer.company_record->$return.company_record");
    expect(edges).toContain("account-brief.brief->$return.brief");
    expect(ir.diagnostics).toEqual([]);
  });

  test("builds caller and return edges for a single-component program", () => {
    const ir = compileSource(
      `---
name: company-index
kind: program
---

### Requires

- \`focus\`: CompanyScope - optional focus area

### Ensures

- \`company_map\`: Markdown<CompanyMap> - company map

### Effects

- \`read_external\`: reads company source
`,
      { path: "fixtures/compiler/company-index.prose.md" },
    );
    const edges = ir.graph.edges.map(
      (edge) =>
        `${edge.from.component}.${edge.from.port}->${edge.to.component}.${edge.to.port}`,
    );

    expect(edges).toContain("$caller.focus->company-index.focus");
    expect(edges).toContain("company-index.company_map->$return.company_map");
  });

  test("parses typed ports, run inputs, effects, access, environment, and execution", () => {
    const ir = compileFixture("typed-effects.prose.md");
    const program = ir.components[0];

    expect(program.ports.requires.map((port) => [port.name, port.type])).toEqual([
      ["company", "CompanyProfile"],
      ["subject", "run<company-enrichment>"],
    ]);
    expect(program.environment[0]).toMatchObject({
      name: "SLACK_WEBHOOK_URL",
      required: true,
    });
    expect(program.effects.map((effect) => effect.kind)).toEqual([
      "read_external",
      "delivers",
    ]);
    expect(program.access.rules).toEqual({
      reads: ["company_private.leads"],
      callable_by: ["revenue", "admin"],
    });
    expect(program.execution?.body).toContain("call brief-writer");
    expect(ir.diagnostics).toEqual([]);
  });

  test("parses source-level policy labels on ports", () => {
    const ir = compileSource(`---
name: labeled-policy
kind: program
---

### Requires

- \`secret\`: string [company_private.accounts, secret_derived] - sensitive input

### Ensures

- \`summary\`: Markdown<Summary> [company_internal] - sanitized summary
`, {
      path: "fixtures/compiler/labeled-policy.prose.md",
    });

    expect(ir.components[0].ports.requires[0]?.policy_labels).toEqual([
      "company_private.accounts",
      "secret_derived",
    ]);
    expect(ir.components[0].ports.ensures[0]?.policy_labels).toEqual([
      "company_internal",
    ]);
  });

  test("parses runtime freshness and pinned package dependencies", () => {
    const freshness = compileFixture("freshness.prose.md");
    const dependencyGraph = compileFixture("dependency-package/graph.prose.md");

    expect(freshness.components[0].runtime).toContainEqual(
      expect.objectContaining({
        key: "freshness",
        value: "6h",
      }),
    );
    expect(freshness.components[0].effects[0]).toMatchObject({
      kind: "read_external",
      config: {
        freshness: "6h",
      },
    });
    expect(dependencyGraph.package.dependencies).toContainEqual(
      expect.objectContaining({
        package: "github.com/openprose/prose",
        sha: "a1b2c3d4",
        refs: ["std/evals/inspector"],
      }),
    );
  });

  test("semantic hash ignores formatting-only blank line changes", () => {
    const a = compileFixture("whitespace-a.prose.md");
    const b = compileFixture("whitespace-b.prose.md");

    expect(a.semantic_hash).toBe(b.semantic_hash);
    expect(a.package.source_sha).not.toBe(b.package.source_sha);
  });

  test("semantic hash changes when port types change", () => {
    const source = fixture("whitespace-a.prose.md");
    const a = compileSource(source, { path: "fixtures/compiler/whitespace-a.prose.md" });
    const b = compileSource(source.replace("string - question", "number - question"), {
      path: "fixtures/compiler/whitespace-a.prose.md",
    });

    expect(a.semantic_hash).not.toBe(b.semantic_hash);
  });

  test("malformed source produces source-located diagnostics", () => {
    const ir = compileFixture("malformed.prose.md");

    expect(ir.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "malformed_port",
      "raw_execution_body",
    ]);
    expect(ir.diagnostics[0].source_span).toMatchObject({
      path: "fixtures/compiler/malformed.prose.md",
      start_line: 8,
      end_line: 8,
    });
  });

  test("projects a VM-readable manifest from IR", () => {
    const manifest = projectManifest(compileFixture("pipeline.prose.md"));

    expect(manifest).toContain("# Manifest: content-pipeline");
    expect(manifest).toContain("Generated by OpenProse from canonical IR.");
    expect(manifest).toContain("draft <- bindings/caller/draft.md");
    expect(manifest).toContain("feedback <- bindings/review/feedback.md");
    expect(manifest).toContain("claims <- bindings/fact-check/claims.md");
    expect(manifest).toContain("polish (depends on: fact-check, review)");
  });
});
