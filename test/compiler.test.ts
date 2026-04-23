import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../src/compiler";
import { formatPath, formatSource, renderFormatCheckText } from "../src/format";
import { buildTextMateGrammar, renderTextMateGrammar } from "../src/grammar";
import { graphSource, renderGraphMermaid } from "../src/graph";
import { highlightSource, renderHighlightHtml, renderHighlightText } from "../src/highlight";
import { installRegistryRef, installWorkspaceDependencies } from "../src/install";
import { lintPath, lintSource, renderLintReportText, renderLintText } from "../src/lint";
import { materializeSource } from "../src/materialize";
import { projectManifest } from "../src/manifest";
import { packagePath, renderPackageText } from "../src/package";
import { planSource } from "../src/plan";
import { publishCheckPath, renderPublishCheckText } from "../src/publish";
import { buildRegistryRef, parseRegistryRef } from "../src/registry";
import { renderCatalogSearchText, searchCatalog } from "../src/search";
import { renderTraceText, traceFile } from "../src/trace";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/compiler/${name}`, import.meta.url), "utf8");
}

function fixturePath(name: string): string {
  return new URL(`../fixtures/${name}`, import.meta.url).pathname;
}

function compileFixture(name: string) {
  return compileSource(fixture(name), { path: `fixtures/compiler/${name}` });
}

function runGit(args: string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(new TextDecoder().decode(result.stderr));
  }
  return new TextDecoder().decode(result.stdout).trim();
}

describe("OpenProse compiler", () => {
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

  test("materializes a succeeded pure single-service run record", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-run-"));
    const result = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-120000-abc123",
      createdAt: "2026-04-23T12:00:00.000Z",
      outputs: {
        message: "Hello from a fixture output.",
      },
      trigger: "test",
    });
    const record = JSON.parse(readFileSync(join(result.run_dir, "run.json"), "utf8"));
    const output = readFileSync(
      join(result.run_dir, "bindings", "hello", "message.md"),
      "utf8",
    );

    expect(record).toMatchObject({
      run_id: "20260423-120000-abc123:hello",
      kind: "component",
      component_ref: "hello",
      status: "succeeded",
      acceptance: { status: "accepted" },
      runtime: { harness: "openprose-bun-local", worker_ref: "fixture-output" },
    });
    expect(output).toBe("Hello from a fixture output.\n");
  });

  test("materializes a graph run with node run records", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-graph-"));
    const result = await materializeSource(fixture("pipeline.prose.md"), {
      path: "fixtures/compiler/pipeline.prose.md",
      runRoot,
      runId: "20260423-121500-def456",
      createdAt: "2026-04-23T12:15:00.000Z",
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
    const record = JSON.parse(readFileSync(join(result.run_dir, "run.json"), "utf8"));

    expect(record).toMatchObject({
      run_id: "20260423-121500-def456",
      kind: "graph",
      component_ref: "content-pipeline",
      status: "succeeded",
    });
    expect(result.node_records.map((node) => [node.component_ref, node.status])).toEqual([
      ["review", "succeeded"],
      ["fact-check", "succeeded"],
      ["polish", "succeeded"],
    ]);
    expect(
      readFileSync(join(result.run_dir, "bindings", "$graph", "final.md"), "utf8"),
    ).toBe("The polished draft.\n");
  });

  test("materialization blocks missing fixture outputs", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-blocked-"));
    const result = await materializeSource(fixture("hello.prose.md"), {
      path: "fixtures/compiler/hello.prose.md",
      runRoot,
      runId: "20260423-123000-fed987",
      createdAt: "2026-04-23T12:30:00.000Z",
      trigger: "test",
    });

    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance).toMatchObject({
      status: "pending",
      reason: "Missing fixture output 'message'.",
    });
  });

  test("materialization blocks side-effecting graphs by default", async () => {
    const runRoot = mkdtempSync(join(tmpdir(), "openprose-effect-"));
    const result = await materializeSource(fixture("typed-effects.prose.md"), {
      path: "fixtures/compiler/typed-effects.prose.md",
      runRoot,
      runId: "20260423-124500-abc987",
      createdAt: "2026-04-23T12:45:00.000Z",
      inputs: {
        company: "Acme profile",
        subject: "run: prior-run",
      },
      outputs: {
        "brief-writer.brief": "Executive brief",
      },
      trigger: "test",
    });

    expect(result.record.status).toBe("blocked");
    expect(result.record.acceptance.reason).toContain(
      "Local materializer does not perform effect 'delivers'.",
    );
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

  test("lints non-canonical source structure", () => {
    const source = `---
name: lint-me
kind: service
---

### Ensures

- \`report\`: Markdown<Report> - final report

### Requires

- \`input\`: string - source input

### Execution

let result = call worker
  input: input

return result
`;

    const diagnostics = lintSource(source, {
      path: "fixtures/compiler/lint-me.md",
    });
    const text = renderLintText(diagnostics);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "non_canonical_extension",
      "non_canonical_section_order",
      "raw_execution_body",
    ]);
    expect(text).toContain("non_canonical_extension");
    expect(text).toContain("non_canonical_section_order");
    expect(text).toContain("raw_execution_body");
  });

  test("formats supported source into canonical order and fenced execution", () => {
    const source = `---
kind: service
name: tidy-me
---

### Ensures

- \`report\`: Markdown<Report> - final report

### Requires

- \`input\`: string - source input

### Execution

let result = call worker
  input: input

return result
`;

    const formatted = formatSource(source, {
      path: "fixtures/compiler/tidy-me.prose.md",
    });

    expect(formatted).toContain("name: tidy-me\nkind: service");
    expect(formatted.indexOf("### Requires")).toBeLessThan(
      formatted.indexOf("### Ensures"),
    );
    expect(formatted).toContain("```prose");
    expect(formatted).toContain("return result");
  });

  test("formatting keeps the semantic hash stable", () => {
    const source = `---
kind: service
name: stable-format
---

### Ensures

- \`report\`: Markdown<Report> - final report

### Requires

- \`input\`: string - source input
`;

    const formatted = formatSource(source, {
      path: "fixtures/compiler/stable-format.prose.md",
    });
    const before = compileSource(source, {
      path: "fixtures/compiler/stable-format.prose.md",
    });
    const after = compileSource(formatted, {
      path: "fixtures/compiler/stable-format.prose.md",
    });

    expect(before.semantic_hash).toBe(after.semantic_hash);
  });

  test("highlights canonical source tokens", () => {
    const view = highlightSource(
      fixture("typed-effects.prose.md"),
      "fixtures/compiler/typed-effects.prose.md",
    );
    const scopes = view.tokens.map((token) => [token.scope, token.text]);

    expect(scopes).toContainEqual(["frontmatter.key", "name"]);
    expect(scopes).toContainEqual(["component.kind", "program"]);
    expect(scopes).toContainEqual(["section.header", "Requires"]);
    expect(scopes).toContainEqual(["port.name", "company"]);
    expect(scopes).toContainEqual(["port.type", "CompanyProfile"]);
    expect(scopes).toContainEqual(["env.name", "SLACK_WEBHOOK_URL"]);
    expect(scopes).toContainEqual(["effect.kind", "read_external"]);
    expect(scopes).toContainEqual(["access.label", "company_private.leads"]);
    expect(scopes).toContainEqual(["prose.keyword", "call"]);
    expect(scopes).toContainEqual(["prose.call_target", "brief-writer"]);
    expect(scopes).toContainEqual(["prose.keyword", "return"]);
  });

  test("renders highlight tokens as text", () => {
    const text = renderHighlightText(
      highlightSource(fixture("hello.prose.md"), "fixtures/compiler/hello.prose.md"),
    );

    expect(text).toContain("frontmatter.key: name");
    expect(text).toContain("component.kind: service");
    expect(text).toContain("section.header: Ensures");
    expect(text).toContain("port.name: message");
  });

  test("renders highlight tokens as html preview", () => {
    const source = fixture("typed-effects.prose.md");
    const html = renderHighlightHtml(
      source,
      highlightSource(source, "fixtures/compiler/typed-effects.prose.md"),
    );

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("OpenProse Highlight Preview");
    expect(html).toContain('class="scope-frontmatter-key">name</span>');
    expect(html).toContain('class="scope-port-type">CompanyProfile</span>');
    expect(html).toContain('class="scope-effect-kind">read_external</span>');
    expect(html).toContain('class="scope-prose-call-target">brief-writer</span>');
  });

  test("builds a textmate grammar artifact", () => {
    const grammar = buildTextMateGrammar();
    const text = renderTextMateGrammar();
    const artifact = readFileSync(
      new URL("../syntaxes/openprose.tmLanguage.json", import.meta.url),
      "utf8",
    );

    expect(grammar.scopeName).toBe("text.openprose.markdown");
    expect(grammar.fileTypes).toContain("prose.md");
    expect(text).toContain('"storage.type.component-kind.openprose"');
    expect(text).toContain('"entity.name.function.call-target.openprose"');
    expect(text).toContain('"variable.parameter.port.openprose"');
    expect(artifact).toBe(text);
  });

  test("parses and builds canonical registry refs", () => {
    const ref = buildRegistryRef({
      catalog: "openprose",
      package_name: "@openprose/catalog-demo",
      version: "0.1.0",
      component: "brief-writer",
    });
    const parsed = parseRegistryRef(ref);

    expect(ref).toBe(
      "registry://openprose/@openprose/catalog-demo@0.1.0/brief-writer",
    );
    expect(parsed).toEqual({
      catalog: "openprose",
      package_name: "@openprose/catalog-demo",
      version: "0.1.0",
      component: "brief-writer",
      ref,
    });
  });

  test("generates package metadata from a canonical package root", async () => {
    const metadata = await packagePath(fixturePath("package/catalog-demo"));
    const text = renderPackageText(metadata);

    expect(metadata.manifest).toMatchObject({
      name: "@openprose/catalog-demo",
      version: "0.1.0",
      catalog: "openprose",
      registry_ref: "registry://openprose/@openprose/catalog-demo@0.1.0",
      no_evals: false,
      hosted: {
        callable: true,
        auth_required: true,
      },
    });
    expect(metadata.components.map((component) => component.name)).toEqual([
      "brief-writer",
      "market-scan",
    ]);
    expect(metadata.components[0].inputs).toContainEqual({
      name: "company",
      type: "CompanyProfile",
    });
    expect(metadata.components[0].effects).toEqual(["pure"]);
    expect(metadata.quality.score).toBeGreaterThan(0.8);
    expect(metadata.quality.warnings).toEqual([]);
    expect(text).toContain("Package: @openprose/catalog-demo@0.1.0");
    expect(text).toContain("brief-writer (service)");
  });

  test("keeps nested package files out of the parent package metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-nested-root-"));
    const nested = join(root, "customers", "nested");
    mkdirSync(nested, { recursive: true });
    writeFileSync(
      join(root, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/root",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/root",
            sha: "abc12345",
          },
          evals: ["evals/root.eval.prose.md"],
          examples: ["examples/root.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(root, "root.prose.md"),
      `---
name: root-service
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - root result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(nested, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/nested",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/nested",
            sha: "def67890",
          },
          evals: ["evals/nested.eval.prose.md"],
          examples: ["examples/nested.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(nested, "nested.prose.md"),
      `---
name: nested-service
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - nested result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const metadata = await packagePath(root);
    const nestedMetadata = await packagePath(join(nested, "nested.prose.md"));

    expect(metadata.manifest.name).toBe("@openprose/root");
    expect(metadata.components.map((component) => component.name)).toEqual([
      "root-service",
    ]);
    expect(nestedMetadata.manifest.name).toBe("@openprose/nested");
    expect(nestedMetadata.components.map((component) => component.name)).toEqual([
      "nested-service",
    ]);
  });

  test("installs a package from a registry ref into local deps state", async () => {
    const sourceRepo = mkdtempSync(join(tmpdir(), "openprose-source-repo-"));
    writeFileSync(
      join(sourceRepo, "README.md"),
      "# Demo source repo\n",
    );
    writeFileSync(
      join(sourceRepo, "brief-writer.prose.md"),
      `---
name: brief-writer
kind: service
---

### Requires

- \`company\`: CompanyProfile - normalized company profile

### Ensures

- \`brief\`: Markdown<ExecutiveBrief> - executive summary

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    runGit(["init"], sourceRepo);
    runGit(["config", "user.email", "openprose@example.com"], sourceRepo);
    runGit(["config", "user.name", "OpenProse Test"], sourceRepo);
    runGit(["add", "."], sourceRepo);
    runGit(["commit", "-m", "fixture"], sourceRepo);
    const sha = runGit(["rev-parse", "HEAD"], sourceRepo);

    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-catalog-"));
    const packageRoot = join(catalogRoot, "catalog-demo");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/install-demo",
          version: "1.2.3",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: sourceRepo,
            sha,
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.run.json"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageRoot, "brief-writer.prose.md"),
      readFileSync(join(sourceRepo, "brief-writer.prose.md"), "utf8"),
    );

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-workspace-"));
    const result = await installRegistryRef(
      "registry://openprose/@openprose/install-demo@1.2.3/brief-writer",
      {
        catalogRoot,
        workspaceRoot,
      },
    );
    const clonedSha = runGit(["rev-parse", "HEAD"], result.install_dir);
    const lockfile = readFileSync(join(workspaceRoot, "prose.lock"), "utf8");

    expect(result.package_name).toBe("@openprose/install-demo");
    expect(result.package_version).toBe("1.2.3");
    expect(result.component_file).toBe(
      `${result.install_dir}/brief-writer.prose.md`,
    );
    expect(clonedSha).toBe(sha);
    expect(lockfile).toContain(`${sourceRepo} ${sha}`);
    expect(lockfile).toContain(
      `registry://openprose/@openprose/install-demo@1.2.3/brief-writer ${sourceRepo} ${sha}`,
    );
  });

  test("installs workspace dependencies with local source overrides and transitive scanning", async () => {
    const commonRepo = mkdtempSync(join(tmpdir(), "openprose-common-repo-"));
    writeFileSync(
      join(commonRepo, "checker.prose.md"),
      `---
name: checker
kind: service
---

### Requires

- \`input\`: Markdown<Input> - input to check

### Ensures

- \`verdict\`: Markdown<Verdict> - verification verdict

### Effects

- \`pure\`: deterministic verification over provided inputs
`,
    );
    runGit(["init"], commonRepo);
    runGit(["config", "user.email", "openprose@example.com"], commonRepo);
    runGit(["config", "user.name", "OpenProse Test"], commonRepo);
    runGit(["add", "."], commonRepo);
    runGit(["commit", "-m", "common"], commonRepo);
    const commonSha = runGit(["rev-parse", "HEAD"], commonRepo);

    const toolsRepo = mkdtempSync(join(tmpdir(), "openprose-tools-repo-"));
    writeFileSync(
      join(toolsRepo, "formatter.prose.md"),
      `---
name: formatter
kind: service
---

### Requires

- \`draft\`: Markdown<Draft> - draft to format

### Ensures

- \`formatted\`: Markdown<Formatted> - formatted draft

### Effects

- \`pure\`: deterministic formatting over provided inputs

### Execution

\`\`\`prose
use "github.com/example/common/checker"

return formatted
\`\`\`
`,
    );
    runGit(["init"], toolsRepo);
    runGit(["config", "user.email", "openprose@example.com"], toolsRepo);
    runGit(["config", "user.name", "OpenProse Test"], toolsRepo);
    runGit(["add", "."], toolsRepo);
    runGit(["commit", "-m", "tools"], toolsRepo);
    const toolsSha = runGit(["rev-parse", "HEAD"], toolsRepo);

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-install-workspace-"));
    writeFileSync(
      join(workspaceRoot, "flow.prose.md"),
      `---
name: install-demo
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - formatted result

### Execution

\`\`\`prose
use "github.com/example/tools/formatter"

return result
\`\`\`
`,
    );

    const result = await installWorkspaceDependencies(workspaceRoot, {
      sourceOverrides: {
        "github.com/example/tools": toolsRepo,
        "github.com/example/common": commonRepo,
      },
    });
    const lockfile = readFileSync(join(workspaceRoot, "prose.lock"), "utf8");

    expect(result.installed_packages.map((entry) => entry.package)).toEqual([
      "github.com/example/common",
      "github.com/example/tools",
    ]);
    expect(lockfile).toContain(`github.com/example/tools ${toolsSha}`);
    expect(lockfile).toContain(`github.com/example/common ${commonSha}`);
    expect(
      readFileSync(
        join(workspaceRoot, ".deps", "github.com", "example", "tools", "formatter.prose.md"),
        "utf8",
      ),
    ).toContain("name: formatter");
  });

  test("refreshes workspace dependency pins against the latest source head", async () => {
    const toolsRepo = mkdtempSync(join(tmpdir(), "openprose-refresh-tools-"));
    writeFileSync(
      join(toolsRepo, "formatter.prose.md"),
      `---
name: formatter
kind: service
---

### Ensures

- \`formatted\`: Markdown<Formatted> - formatted draft

### Effects

- \`pure\`: deterministic formatting over provided inputs
`,
    );
    runGit(["init"], toolsRepo);
    runGit(["config", "user.email", "openprose@example.com"], toolsRepo);
    runGit(["config", "user.name", "OpenProse Test"], toolsRepo);
    runGit(["add", "."], toolsRepo);
    runGit(["commit", "-m", "tools v1"], toolsRepo);
    const firstSha = runGit(["rev-parse", "HEAD"], toolsRepo);

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-refresh-workspace-"));
    writeFileSync(
      join(workspaceRoot, "flow.prose.md"),
      `---
name: install-demo
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - formatted result

### Execution

\`\`\`prose
use "github.com/example/tools/formatter"

return result
\`\`\`
`,
    );

    await installWorkspaceDependencies(workspaceRoot, {
      sourceOverrides: {
        "github.com/example/tools": toolsRepo,
      },
    });

    writeFileSync(
      join(toolsRepo, "formatter.prose.md"),
      `---
name: formatter
kind: service
---

### Ensures

- \`formatted\`: Markdown<Formatted> - refreshed formatted draft

### Effects

- \`pure\`: deterministic formatting over provided inputs
`,
    );
    runGit(["add", "."], toolsRepo);
    runGit(["commit", "-m", "tools v2"], toolsRepo);
    const secondSha = runGit(["rev-parse", "HEAD"], toolsRepo);

    await installWorkspaceDependencies(workspaceRoot, {
      refresh: true,
      sourceOverrides: {
        "github.com/example/tools": toolsRepo,
      },
    });

    const lockfile = readFileSync(join(workspaceRoot, "prose.lock"), "utf8");

    expect(firstSha).not.toBe(secondSha);
    expect(lockfile).toContain(`github.com/example/tools ${secondSha}`);
    expect(
      readFileSync(
        join(workspaceRoot, ".deps", "github.com", "example", "tools", "formatter.prose.md"),
        "utf8",
      ),
    ).toContain("refreshed formatted draft");
  });

  test("warns when generated package metadata is missing publishing inputs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-package-"));
    writeFileSync(join(dir, "hello.prose.md"), fixture("hello.prose.md"));

    const metadata = await packagePath(dir);

    expect(metadata.manifest.name).toContain("openprose-package-");
    expect(metadata.manifest.version).toBeNull();
    expect(metadata.manifest.source.sha).toBeNull();
    expect(metadata.manifest.no_evals).toBe(true);
    expect(metadata.quality.warnings).toContain(
      "Missing package version in prose.package.json.",
    );
    expect(metadata.quality.warnings).toContain(
      "Missing source.git in prose.package.json.",
    );
    expect(metadata.quality.warnings).toContain(
      "Package has no linked evals; publish should record no_evals or add eval coverage.",
    );
  });

  test("infers source metadata from git when package config omits source", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-package-git-"));
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/git-demo",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          evals: ["evals/git-demo.eval.prose.md"],
          examples: ["examples/git-demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(join(dir, "hello.prose.md"), fixture("typed-effects.prose.md"));

    runGit(["init"], dir);
    runGit(["config", "user.email", "openprose@example.com"], dir);
    runGit(["config", "user.name", "OpenProse Test"], dir);
    runGit(["remote", "add", "origin", "git@github.com:openprose/git-demo.git"], dir);
    runGit(["add", "."], dir);
    runGit(["commit", "-m", "init"], dir);
    const sha = runGit(["rev-parse", "HEAD"], dir);

    const metadata = await packagePath(dir);

    expect(metadata.manifest.source.git).toBe("github.com/openprose/git-demo");
    expect(metadata.manifest.source.sha).toBe(sha);
    expect(metadata.manifest.source.subpath).toBeNull();
    expect(metadata.quality.warnings).not.toContain("Missing source.git in prose.package.json.");
    expect(metadata.quality.warnings).not.toContain("Missing source.sha in prose.package.json.");
  });

  test("installs a monorepo package component at its package subpath", async () => {
    const sourceRepo = mkdtempSync(join(tmpdir(), "openprose-monorepo-source-"));
    const packageSourceRoot = join(sourceRepo, "packages", "demo");
    mkdirSync(packageSourceRoot, { recursive: true });
    writeFileSync(
      join(packageSourceRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/monorepo-demo",
          version: "2.0.0",
          registry: {
            catalog: "openprose",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageSourceRoot, "demo.prose.md"),
      `---
name: demo
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - demo result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    runGit(["init"], sourceRepo);
    runGit(["config", "user.email", "openprose@example.com"], sourceRepo);
    runGit(["config", "user.name", "OpenProse Test"], sourceRepo);
    runGit(["remote", "add", "origin", "git@github.com:openprose/monorepo-demo.git"], sourceRepo);
    runGit(["add", "."], sourceRepo);
    runGit(["commit", "-m", "fixture"], sourceRepo);
    const sha = runGit(["rev-parse", "HEAD"], sourceRepo);

    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-monorepo-catalog-"));
    const packageRoot = join(catalogRoot, "monorepo-demo");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/monorepo-demo",
          version: "2.0.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: sourceRepo,
            sha,
            subpath: "packages/demo",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageRoot, "demo.prose.md"),
      readFileSync(join(packageSourceRoot, "demo.prose.md"), "utf8"),
    );

    const workspaceRoot = mkdtempSync(join(tmpdir(), "openprose-monorepo-workspace-"));
    const result = await installRegistryRef(
      "registry://openprose/@openprose/monorepo-demo@2.0.0/demo",
      {
        catalogRoot,
        workspaceRoot,
      },
    );

    expect(result.component_file).toBe(
      `${result.install_dir}/packages/demo/demo.prose.md`,
    );
  });

  test("passes publish check for a ready fixture package", async () => {
    const result = await publishCheckPath(fixturePath("package/catalog-demo"));
    const text = renderPublishCheckText(result);

    expect(result.status).toBe("pass");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(text).toContain("Publish check: PASS @openprose/catalog-demo@0.1.0");
  });

  test("warns publish check when advisory quality links are missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-publish-warn-"));
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/warn-demo",
          version: "0.1.0",
          source: {
            git: "github.com/openprose/warn-demo",
            sha: "feedbeef",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "scan.prose.md"),
      `---
name: scan
kind: service
---

### Requires

- \`company\`: CompanyProfile - normalized company profile

### Ensures

- \`summary\`: Markdown<Summary> - concise company summary

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const result = await publishCheckPath(dir);

    expect(result.status).toBe("warn");
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContain(
      "Package has no linked evals; publish should record no_evals or add eval coverage.",
    );
    expect(result.warnings).toContain("Package has no linked examples.");
  });

  test("ignores test components in publish quality warnings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-publish-tests-"));
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/test-scope",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/test-scope",
            sha: "beadfeed",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, "service.prose.md"),
      `---
name: publishable
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - publishable result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(dir, "service.eval.prose.md"),
      `---
name: publishable.eval
kind: test
---

### Ensures

- \`verdict\`: Verdict - evaluation verdict
`,
    );

    const result = await publishCheckPath(dir);

    expect(result.status).toBe("pass");
    expect(result.warnings).toEqual([]);
  });

  test("fails publish check for missing publish blockers and strict warnings", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-publish-fail-"));
    writeFileSync(join(dir, "hello.prose.md"), fixture("hello.prose.md"));

    const result = await publishCheckPath(dir, { strict: true });

    expect(result.status).toBe("fail");
    expect(result.blockers).toContain("Missing package version in prose.package.json.");
    expect(result.blockers).toContain("Missing source.git in prose.package.json.");
    expect(result.blockers).toContain("Missing source.sha in prose.package.json.");
    expect(result.blockers).toContain(
      "Package has no linked evals; publish should record no_evals or add eval coverage.",
    );
    expect(result.blockers).toContain("Package has no linked examples.");
  });

  test("searches catalog metadata by effect", async () => {
    const result = await searchCatalog(fixturePath("package"), {
      effect: ["read_external"],
    });
    const text = renderCatalogSearchText(result);

    expect(result.package_count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      package_name: "@openprose/catalog-demo",
      component_name: "market-scan",
      component_kind: "service",
    });
    expect(text).toContain("market-scan (service)");
  });

  test("searches catalog metadata by type and minimum quality", async () => {
    const result = await searchCatalog(fixturePath("package"), {
      type: ["Markdown<ExecutiveBrief>"],
      minQuality: 0.9,
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0].component_name).toBe("brief-writer");
    expect(result.results[0].quality_score).toBeGreaterThanOrEqual(0.9);
  });

  test("search discovers nested configured packages in a monorepo catalog", async () => {
    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-catalog-nested-"));
    const packageRoot = join(catalogRoot, "company");
    const nestedRoot = join(packageRoot, "customers", "child");
    mkdirSync(nestedRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/company",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/company",
            sha: "11111111",
          },
          evals: ["evals/company.eval.prose.md"],
          examples: ["examples/company.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(packageRoot, "company.prose.md"),
      `---
name: company-map
kind: service
---

### Ensures

- \`company_map\`: Markdown<CompanyMap> - source-grounded company map

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(nestedRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/child",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/child",
            sha: "22222222",
          },
          evals: ["evals/child.eval.prose.md"],
          examples: ["examples/child.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(nestedRoot, "child.prose.md"),
      `---
name: child-map
kind: service
---

### Ensures

- \`child_map\`: Markdown<ChildMap> - source-grounded child map

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const result = await searchCatalog(catalogRoot);

    expect(result.package_count).toBe(2);
    expect(result.results.map((entry) => entry.package_name)).toEqual([
      "@openprose/child",
      "@openprose/company",
    ]);
  });

  test("search excludes test components unless explicitly requested", async () => {
    const catalogRoot = mkdtempSync(join(tmpdir(), "openprose-search-tests-"));
    writeFileSync(
      join(catalogRoot, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/search-tests",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
          source: {
            git: "github.com/openprose/search-tests",
            sha: "33333333",
          },
          evals: ["evals/demo.eval.prose.md"],
          examples: ["examples/demo.prose.md"],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(catalogRoot, "service.prose.md"),
      `---
name: search-service
kind: service
---

### Ensures

- \`result\`: Markdown<Result> - service result

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );
    writeFileSync(
      join(catalogRoot, "service.eval.prose.md"),
      `---
name: search-service.eval
kind: test
---

### Ensures

- \`verdict\`: Verdict - evaluation verdict
`,
    );

    const defaultResult = await searchCatalog(catalogRoot);
    const testResult = await searchCatalog(catalogRoot, {
      kind: "test",
    });

    expect(defaultResult.results.map((entry) => entry.component_name)).toEqual([
      "search-service",
    ]);
    expect(testResult.results.map((entry) => entry.component_name)).toEqual([
      "search-service.eval",
    ]);
  });

  test("lints a directory of source files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-lint-dir-"));
    writeFileSync(
      join(dir, "legacy.md"),
      `---
name: legacy
kind: service
---

### Ensures

- \`report\`: Markdown<Report> - final report

### Requires

- \`input\`: string - source input
`,
    );
    writeFileSync(
      join(dir, "clean.prose.md"),
      fixture("hello.prose.md"),
    );

    const report = await lintPath(dir);
    const text = renderLintReportText(report);

    expect(Array.from(report.keys()).length).toBe(2);
    expect(report.get(join(dir, "legacy.md").replace(/\\/g, "/"))?.map((d) => d.code)).toContain(
      "non_canonical_extension",
    );
    expect(text).toContain("legacy.md: 2 diagnostics");
    expect(text).toContain("clean.prose.md: 0 diagnostics");
  });

  test("lints a directory with package-local service references", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-lint-package-"));
    writeFileSync(
      join(dir, "pipeline.prose.md"),
      `---
name: package-pipeline
kind: program
---

### Services

- \`summarize\`

### Ensures

- \`brief\`: Markdown<Brief> - package brief
`,
    );
    writeFileSync(
      join(dir, "summarize.prose.md"),
      `---
name: summarize
kind: service
---

### Ensures

- \`brief\`: Markdown<Brief> - package brief

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const report = await lintPath(dir);

    expect(
      report
        .get(join(dir, "pipeline.prose.md").replace(/\\/g, "/"))
        ?.map((diagnostic) => diagnostic.code),
    ).toEqual([]);
    expect(
      report
        .get(join(dir, "summarize.prose.md").replace(/\\/g, "/"))
        ?.map((diagnostic) => diagnostic.code),
    ).toEqual([]);
  });

  test("lints a package subdirectory with package-wide service context", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-lint-scope-"));
    const systemsDir = join(dir, "systems");
    const sharedDir = join(dir, "shared");
    mkdirSync(systemsDir, { recursive: true });
    mkdirSync(sharedDir, { recursive: true });
    writeFileSync(
      join(dir, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/lint-scope",
          version: "0.1.0",
          registry: {
            catalog: "openprose",
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(systemsDir, "pipeline.prose.md"),
      `---
name: package-pipeline
kind: program
---

### Services

- \`summarize\`

### Ensures

- \`brief\`: Markdown<Brief> - package brief
`,
    );
    writeFileSync(
      join(sharedDir, "summarize.prose.md"),
      `---
name: summarize
kind: service
---

### Ensures

- \`brief\`: Markdown<Brief> - package brief

### Effects

- \`pure\`: deterministic synthesis over provided inputs
`,
    );

    const report = await lintPath(systemsDir);

    expect(
      report
        .get(join(systemsDir, "pipeline.prose.md").replace(/\\/g, "/"))
        ?.map((diagnostic) => diagnostic.code),
    ).toEqual([]);
  });

  test("checks formatting across a directory of canonical files", async () => {
    const dir = mkdtempSync(join(tmpdir(), "openprose-fmt-dir-"));
    const tidyPath = join(dir, "tidy.prose.md");
    const cleanPath = join(dir, "clean.prose.md");
    writeFileSync(
      tidyPath,
      `---
kind: service
name: tidy
---

### Ensures

- \`report\`: Markdown<Report> - final report

### Requires

- \`input\`: string - source input
`,
    );
    writeFileSync(
      cleanPath,
      formatSource(fixture("hello.prose.md"), { path: cleanPath }),
    );

    const results = await formatPath(dir, { check: true });
    const text = renderFormatCheckText(results);

    expect(results).toContainEqual({
      path: tidyPath.replace(/\\/g, "/"),
      changed: true,
    });
    expect(results).toContainEqual({
      path: cleanPath.replace(/\\/g, "/"),
      changed: false,
    });
    expect(text).toContain("Needs formatting");
    expect(text).toContain("tidy.prose.md");
  });
});
