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

describe("OpenProse planning, graph, trace, and status views", () => {
  test("does not block planning on optional inputs", () => {
    const plan = planSource(
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

    expect(plan.status).toBe("ready");
    expect(plan.nodes[0]).toMatchObject({
      component_ref: "company-index",
      status: "ready",
      blocked_reasons: [],
    });
  });

  test("plans a pure graph as ready when caller inputs are available", () => {
    const plan = planSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      inputs: {
        draft: "The original draft.",
      },
    });

    expect(plan.status).toBe("ready");
    expect(plan.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["review", "ready"],
      ["fact-check", "ready"],
      ["polish", "ready"],
    ]);
    expect(plan.nodes[0].stale_reasons).toEqual(["no_current_run"]);
  });

  test("plans missing caller inputs as blocked", () => {
    const plan = planSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
    });

    expect(plan.status).toBe("blocked");
    expect(plan.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["review", "blocked_input"],
      ["fact-check", "blocked_input"],
      ["polish", "blocked_input"],
    ]);
    expect(plan.nodes[0].blocked_reasons).toContain(
      "Missing required input 'draft'.",
    );
  });

  test("plans side-effecting graphs as blocked by effect", () => {
    const plan = planSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
    });

    expect(plan.status).toBe("blocked");
    expect(plan.graph_blocked_reasons).toContain(
      "Graph effect 'delivers' requires a gate before execution.",
    );
    expect(plan.nodes).toContainEqual(
      expect.objectContaining({
        component_ref: "brief-writer",
        status: "ready",
      }),
    );
  });

  test("plans matching prior materialization as current", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-current-"));
    const materialized = await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "20260423-131500-cur001",
      createdAt: "2026-04-23T13:15:00.000Z",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "All claims verified.",
        "polish.final": "The polished draft.",
      },
      trigger: "test",
    });

    const plan = planSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      inputs: {
        draft: "The original draft.",
      },
      currentRun: {
        graph: materialized.record,
        nodes: materialized.node_records,
      },
    });

    expect(plan.status).toBe("current");
    expect(plan.graph_stale_reasons).toEqual([]);
    expect(plan.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["review", "current"],
      ["fact-check", "current"],
      ["polish", "current"],
    ]);
    expect(plan.nodes.every((node) => node.stale_reasons.length === 0)).toBe(true);
  });

  test("plans changed caller input as stale but ready", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-stale-input-"));
    const materialized = await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "20260423-133000-sta001",
      createdAt: "2026-04-23T13:30:00.000Z",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "All claims verified.",
        "polish.final": "The polished draft.",
      },
      trigger: "test",
    });

    const plan = planSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      inputs: {
        draft: "A changed draft.",
      },
      currentRun: {
        graph: materialized.record,
        nodes: materialized.node_records,
      },
    });

    expect(plan.status).toBe("ready");
    expect(plan.graph_stale_reasons).toContain("input_hash_changed:draft");
    expect(plan.nodes[0].stale_reasons).toContain("input_hash_changed:draft");
    expect(plan.nodes[2].stale_reasons).toContain("upstream_stale:review");
  });

  test("plans changed source semantics as stale", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-stale-source-"));
    const materialized = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-134500-src001",
      createdAt: "2026-04-23T13:45:00.000Z",
      outputs: {
        message: "Hello from a fixture output.",
      },
      trigger: "test",
    });
    const changedSource = fixture("hello.prose.md").replace(
      "Markdown<Greeting>",
      "Markdown<NewGreeting>",
    );

    const plan = planSource(changedSource, {
      path: "fixtures/compiler/hello.prose.md",
      currentRun: {
        graph: null,
        nodes: materialized.node_records,
      },
    });

    expect(plan.status).toBe("ready");
    expect(plan.nodes[0].stale_reasons).toContain("ir_hash_changed");
  });

  test("plans expired freshness as stale", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-freshness-"));
    const materialized = await materializeSource(fixture("freshness.prose.md"), {
      path: "fixtures/compiler/freshness.prose.md",
      runRoot,
      runId: "20260423-150000-frh001",
      createdAt: "2026-04-23T00:00:00.000Z",
      inputs: {
        org: "openprose",
      },
      outputs: {
        report: "Fresh enough report.",
      },
      trigger: "test",
    });

    const plan = planSource(fixture("freshness.prose.md"), {
      path: "fixtures/compiler/freshness.prose.md",
      inputs: {
        org: "openprose",
      },
      currentRun: {
        graph: null,
        nodes: materialized.node_records,
      },
      now: "2026-04-23T07:00:00.000Z",
    });

    expect(plan.status).toBe("ready");
    expect(plan.nodes[0].stale_reasons).toContain("freshness_expired:6h");
  });

  test("plans changed dependency pins as stale", async () => {
    const fixtureDir = mkdtempSync(join(tmpdir(), "openprose-dependency-"));
    const sourcePath = join(fixtureDir, "graph.prose.md");
    const lockPath = join(fixtureDir, "prose.lock");
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(sourcePath, fixture("dependency-package/graph.prose.md"));
    writeFileSync(
      lockPath,
      readFileSync(
        new URL("../fixtures/compiler/dependency-package/prose.lock", import.meta.url),
        "utf8",
      ),
    );

    const materialized = await materializeSource(
      readFileSync(sourcePath, "utf8"),
      {
        path: sourcePath,
        runRoot: join(fixtureDir, ".prose", "runs"),
        runId: "20260423-153000-dep001",
        createdAt: "2026-04-23T15:30:00.000Z",
        inputs: {
          draft: "Draft for dependency-aware review.",
        },
        outputs: {
          "review.final": "Reviewed final brief.",
        },
        trigger: "test",
      },
    );

    writeFileSync(lockPath, "github.com/openprose/prose ffffffff\n");

    const plan = planSource(readFileSync(sourcePath, "utf8"), {
      path: sourcePath,
      inputs: {
        draft: "Draft for dependency-aware review.",
      },
      currentRun: {
        graph: materialized.record,
        nodes: materialized.node_records,
      },
    });

    expect(plan.status).toBe("ready");
    expect(plan.graph_stale_reasons).toContain(
      "dependency_sha_changed:github.com/openprose/prose",
    );
    expect(plan.nodes[0].stale_reasons).toContain(
      "dependency_sha_changed:github.com/openprose/prose",
    );
  });

  test("skips stale-but-unneeded nodes for a targeted output", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-selective-"));
    const materialized = await materializeSource(
      fixture("selective-recompute.prose.md"),
      {
        path: "fixtures/compiler/selective-recompute.prose.md",
        runRoot,
        runId: "20260423-160000-sel001",
        createdAt: "2026-04-23T10:00:00.000Z",
        inputs: {
          draft: "A stable draft.",
          company: "openprose",
        },
        outputs: {
          "summarize.summary": "Stable summary.",
          "market-sync.market_snapshot": "Expired market snapshot.",
        },
        trigger: "test",
      },
    );

    const plan = planSource(fixture("selective-recompute.prose.md"), {
      path: "fixtures/compiler/selective-recompute.prose.md",
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      currentRun: {
        graph: materialized.record,
        nodes: materialized.node_records,
      },
      targetOutputs: ["summary"],
      now: "2026-04-23T12:30:00.000Z",
    });

    expect(plan.requested_outputs).toEqual(["summary"]);
    expect(plan.status).toBe("current");
    expect(plan.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["summarize", "current"],
      ["market-sync", "skipped"],
    ]);
    expect(plan.nodes[1].stale_reasons).toContain("freshness_expired:1h");
    expect(plan.materialization_set).toEqual({
      graph: false,
      nodes: [],
    });
  });

  test("prints the exact materialization set for a targeted stale output", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-selective-run-"));
    const materialized = await materializeSource(
      fixture("selective-recompute.prose.md"),
      {
        path: "fixtures/compiler/selective-recompute.prose.md",
        runRoot,
        runId: "20260423-161500-sel002",
        createdAt: "2026-04-23T10:00:00.000Z",
        inputs: {
          draft: "A stable draft.",
          company: "openprose",
        },
        outputs: {
          "summarize.summary": "Stable summary.",
          "market-sync.market_snapshot": "Expired market snapshot.",
        },
        trigger: "test",
      },
    );

    const plan = planSource(fixture("selective-recompute.prose.md"), {
      path: "fixtures/compiler/selective-recompute.prose.md",
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      currentRun: {
        graph: materialized.record,
        nodes: materialized.node_records,
      },
      targetOutputs: ["market_snapshot"],
      now: "2026-04-23T12:30:00.000Z",
    });

    expect(plan.requested_outputs).toEqual(["market_snapshot"]);
    expect(plan.status).toBe("ready");
    expect(plan.materialization_set).toEqual({
      graph: false,
      nodes: ["market-sync"],
    });
    expect(plan.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["summarize", "current"],
      ["market-sync", "ready"],
    ]);
  });

  test("builds a graph preview JSON with plan overlay", () => {
    const graph = graphSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      inputs: {
        draft: "The original draft.",
      },
      targetOutputs: ["final"],
      format: "json",
    });

    expect(graph.component_ref).toBe("content-pipeline");
    expect(graph.requested_outputs).toEqual(["final"]);
    expect(graph.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["Caller", "boundary"],
      ["review", "ready"],
      ["fact-check", "ready"],
      ["polish", "ready"],
      ["Return", "boundary"],
    ]);
    expect(graph.edges).toContainEqual(
      expect.objectContaining({
        from: "review",
        to: "polish",
        from_port: "feedback",
        to_port: "feedback",
        kind: "exact",
      }),
    );
  });

  test("renders a mermaid graph preview", () => {
    const graph = graphSource(fixture("selective-recompute.prose.md"), {
      path: "fixtures/compiler/selective-recompute.prose.md",
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      targetOutputs: ["summary"],
      format: "mermaid",
    });
    const mermaid = renderGraphMermaid(graph);

    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain("summarize");
    expect(mermaid).toContain("market-sync");
    expect(mermaid).toContain("selected");
    expect(mermaid).toContain("classDef ready");
    expect(mermaid).toContain("classDef skipped");
  });

  test("loads a trace view from a materialized run directory", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-trace-"));
    const materialized = await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "20260423-170000-trc001",
      createdAt: "2026-04-23T17:00:00.000Z",
      inputs: {
        draft: "The original draft.",
      },
      outputs: {
        "review.feedback": "Tighten the intro.",
        "fact-check.claims": "All claims verified.",
        "polish.final": "The polished draft.",
      },
      trigger: "test",
    });

    const trace = await traceFile(materialized.run_dir);

    expect(trace.run_id).toBe("20260423-170000-trc001");
    expect(trace.component_ref).toBe("content-pipeline");
    expect(trace.status).toBe("succeeded");
    expect(trace.outputs).toEqual(["final"]);
    expect(trace.nodes.map((node) => [node.component_ref, node.status])).toEqual([
      ["fact-check", "succeeded"],
      ["polish", "succeeded"],
      ["review", "succeeded"],
    ]);
    expect(trace.events[0]).toMatchObject({
      event: "materialize.started",
      run_id: "20260423-170000-trc001",
    });
  });

  test("renders a text trace summary", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-trace-text-"));
    const materialized = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-171500-trc002",
      createdAt: "2026-04-23T17:15:00.000Z",
      outputs: {
        message: "Hello from a fixture output.",
      },
      trigger: "test",
    });

    const trace = await traceFile(materialized.run_dir);
    const text = renderTraceText(trace);

    expect(text).toContain("Run: 20260423-171500-trc002:hello");
    expect(text).toContain("Component: hello [component]");
    expect(text).toContain("Status: succeeded (accepted)");
    expect(text).toContain("Outputs: message");
    expect(text).toContain("Events:");
  });

  test("summarizes recent run materializations", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-status-"));

    await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-183000-aaa111",
      createdAt: "2026-04-23T18:30:00.000Z",
      outputs: {
        message: "Earlier run output.",
      },
      trigger: "test",
    });

    await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "20260423-184500-bbb222",
      createdAt: "2026-04-23T18:45:00.000Z",
      inputs: {
        draft: "Later run draft.",
      },
      outputs: {
        "review.feedback": "Later feedback.",
        "fact-check.claims": "Later claims.",
        "polish.final": "Later polished draft.",
      },
      trigger: "test",
    });

    const status = await statusPath(runRoot);
    const text = renderStatusText(status);

    expect(status.total).toBe(2);
    expect(status.runs.map((run) => run.run_id)).toEqual([
      "20260423-184500-bbb222",
      "20260423-183000-aaa111:hello",
    ]);
    expect(status.runs[0]).toMatchObject({
      component_ref: "content-pipeline",
      status: "succeeded",
      acceptance: "accepted",
      node_count: 3,
      outputs: ["final"],
    });
    expect(text).toContain("Runs: 2");
    expect(text).toContain("content-pipeline [graph] succeeded (accepted)");
    expect(text).toContain("hello [component] succeeded (accepted)");
  });
});
