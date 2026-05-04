import { describe, expect, test } from "./support";
import { projectManifest } from "../src/manifest";

function blankComponent(overrides: Record<string, unknown> = {}): any {
  return {
    id: "x",
    name: "x",
    kind: "system",
    source: {
      path: "x.prose.md",
      span: { path: "x.prose.md", start_line: 1, end_line: 1 },
    },
    ports: { requires: [], ensures: [] },
    services: [],
    schemas: [],
    runtime: [],
    environment: [],
    execution: null,
    strategies: null,
    errors: null,
    finally: null,
    catch: null,
    effects: [],
    access: { reads: [], writes: [] },
    evals: [],
    expansions: [],
    skills: [],
    ...overrides,
  };
}

function blankIR(components: any[]): any {
  return {
    package: { name: "demo", source_ref: "demo.prose.md" },
    semantic_hash: "deadbeef",
    components,
    graph: { nodes: [], edges: [] },
    diagnostics: [],
  };
}

describe("manifest projection of skills", () => {
  test("projected manifest carries resolved skills per component", () => {
    const component = blankComponent({
      skills: [
        {
          declared_name: "pdf",
          canonical_name: "document-skills:pdf",
          resolution: "fuzzy",
          fuzzy_distance: 1,
          source_span: { path: "x.prose.md", start_line: 4, end_line: 4 },
        },
        {
          declared_name: "document-skills:xlsx",
          canonical_name: "document-skills:xlsx",
          resolution: "exact",
          source_span: { path: "x.prose.md", start_line: 5, end_line: 5 },
        },
      ],
    });
    const markdown = projectManifest(blankIR([component]));

    expect(markdown).toContain("skills:");
    expect(markdown).toContain(
      "pdf -> document-skills:pdf (fuzzy, distance 1)",
    );
    expect(markdown).toContain(
      "document-skills:xlsx -> document-skills:xlsx (exact)",
    );
  });

  test("components without skills omit the skills block", () => {
    const component = blankComponent();
    const markdown = projectManifest(blankIR([component]));
    expect(markdown).not.toContain("skills:");
  });

  test("unresolved skills render with a clear marker", () => {
    const component = blankComponent({
      skills: [
        {
          declared_name: "missing:thing",
          canonical_name: "",
          resolution: "unresolved",
          source_span: { path: "x.prose.md", start_line: 4, end_line: 4 },
        },
      ],
    });
    const markdown = projectManifest(blankIR([component]));
    expect(markdown).toContain("missing:thing -> (unresolved)");
  });
});
