import {
  compilePackagePath,
  describe,
  expect,
  fixturePath,
  readFileSync,
  runProseCli,
  test,
} from "./support";

type PackageIR = Awaited<ReturnType<typeof compilePackagePath>>;

function counts(values: string[]) {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((item) => item === value).length]),
  );
}

function summarizePackageIR(ir: PackageIR) {
  return {
    package_ir_version: ir.package_ir_version,
    semantic_hash: ir.semantic_hash,
    manifest: ir.manifest,
    files: ir.files.map((file) => ({
      path: file.path,
      component_ids: file.component_ids,
      diagnostics: file.diagnostics.map((diagnostic) => diagnostic.code),
    })),
    dependencies: ir.dependencies,
    components: ir.components.map((component) => ({
      id: component.id,
      name: component.name,
      kind: component.kind,
      path: component.source.path,
      expansions: component.expansions.map((expansion) => ({
        id: expansion.id,
        service_name: expansion.service_name,
        compose_ref: expansion.compose_ref,
        with: expansion.with,
        status: expansion.status,
        resolved_component_id: expansion.resolved_component_id,
      })),
    })),
    graph: {
      node_count: ir.graph.nodes.length,
      edge_count: ir.graph.edges.length,
      edge_kinds: counts(ir.graph.edges.map((edge) => edge.kind)),
    },
    diagnostics: counts(ir.diagnostics.map((diagnostic) => diagnostic.code)),
  };
}

function golden(name: string) {
  return JSON.parse(readFileSync(fixturePath(`package-ir/${name}.summary.json`), "utf8"));
}

describe("OpenProse package IR", () => {
  test("compiles examples as one package contract", async () => {
    const ir = await compilePackagePath("examples");

    expect(summarizePackageIR(ir)).toEqual(golden("examples"));
    expect(ir.components.some((component) => component.source.path.includes("/"))).toBe(true);
  });

  test("CLI compile accepts a package directory", () => {
    const result = runProseCli(["compile", "examples", "--no-pretty"]);
    const parsed = JSON.parse(new TextDecoder().decode(result.stdout));

    expect(result.exitCode).toBe(0);
    expect(parsed.package_ir_version).toBe("0.1");
    expect(parsed.manifest.name).toBe("@openprose/examples");
  });

  test("compiles std as one package contract", async () => {
    const ir = await compilePackagePath("packages/std");

    expect(summarizePackageIR(ir)).toEqual(golden("std"));
    expect(ir.manifest.evals).toHaveLength(7);
  });

  test("compiles co as one package contract", async () => {
    const ir = await compilePackagePath("packages/co");

    expect(summarizePackageIR(ir)).toEqual(golden("co"));
    expect(ir.graph.edges.some((edge) => edge.kind === "execution")).toBe(true);
  });
});
