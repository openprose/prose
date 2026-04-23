import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../src/compiler";
import { formatSource } from "../src/format";
import { graphSource, renderGraphMermaid } from "../src/graph";
import { highlightSource, renderHighlightText } from "../src/highlight";
import { lintSource, renderLintText } from "../src/lint";
import { materializeSource } from "../src/materialize";
import { projectManifest } from "../src/manifest";
import { planSource } from "../src/plan";
import { renderTraceText, traceFile } from "../src/trace";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/compiler/${name}`, import.meta.url), "utf8");
}

function compileFixture(name: string) {
  return compileSource(fixture(name), { path: `fixtures/compiler/${name}` });
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
});
