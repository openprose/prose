import {
  compilePackagePath,
  compileSource,
  describe,
  expect,
  fixturePath,
  readFileSync,
  test,
} from "./support";

function golden(name: string) {
  return JSON.parse(readFileSync(fixturePath(`composite-expansion/${name}.json`), "utf8"));
}

describe("OpenProse composite expansion", () => {
  test("parses Level 1 composite service shorthand", () => {
    const source = readFileSync(
      fixturePath("package-ir/composite-package/program.prose.md"),
      "utf8",
    );
    const ir = compileSource(source, {
      path: "fixtures/package-ir/composite-package/program.prose.md",
    });
    const service = ir.components[0].services[0];

    expect(service).toMatchObject({
      name: "reviewed-draft",
      ref: "worker-critic",
      compose: "worker-critic",
      with: {
        worker: "writer",
        critic: "reviewer",
        max_rounds: 2,
      },
    });
    expect(ir.components[0].expansions[0]).toMatchObject({
      service_name: "reviewed-draft",
      compose_ref: "worker-critic",
      status: "unresolved",
    });
  });

  test("resolves package-local composite expansions with source maps", async () => {
    const ir = await compilePackagePath(fixturePath("package-ir/composite-package"));
    const program = ir.components.find((component) => component.name === "composite-demo");
    const expansion = program?.expansions[0];

    expect(expansion).toMatchObject({
      status: "resolved",
      resolved_component_id: "worker-critic--worker-critic",
      source_span: {
        path: "program.prose.md",
        start_line: 8,
        end_line: 11,
      },
      definition_source_span: {
        path: "worker-critic.prose.md",
      },
    });
    expect(
      ir.graph.edges.some(
        (edge) =>
          edge.from.component === program?.id &&
          edge.from.port === "$compose" &&
          edge.to.component === "worker-critic--worker-critic",
      ),
    ).toBe(true);
  });

  test("keeps std composed reviewer expansion stable", async () => {
    const ir = await compilePackagePath("packages/std");
    const component = ir.components.find((candidate) => candidate.name === "composed-reviewer");
    const expansionEdges = ir.graph.edges.filter(
      (edge) => edge.from.component === component?.id && edge.from.port === "$compose",
    );

    expect({
      component: component
        ? {
            id: component.id,
            name: component.name,
            path: component.source.path,
            expansions: component.expansions,
          }
        : null,
      expansion_edges: expansionEdges,
    }).toEqual(golden("std-composed-reviewer"));
  });
});
