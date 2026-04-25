import {
  compilePackagePath,
  describe,
  expect,
  fixturePath,
  join,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  runProseCli,
  test,
  tmpdir,
  writeFileSync,
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
    hashes: ir.hashes,
    manifest: ir.manifest,
    files: ir.files.map((file) => ({
      path: file.path,
      component_ids: file.component_ids,
      diagnostics: file.diagnostics.map((diagnostic) => diagnostic.code),
    })),
    resources: ir.resources.map((resource) => ({
      kind: resource.kind,
      path: resource.path,
      exists: resource.exists,
      component_ids: resource.component_ids,
      diagnostics: resource.diagnostics.map((diagnostic) => diagnostic.code),
    })),
    dependencies: ir.dependencies,
    policy: {
      effects: counts(ir.policy.effects.map((effect) => effect.kind)),
      access: ir.policy.access.map((entry) => ({
        component_id: entry.component_id,
        key: entry.key,
        labels: entry.labels,
      })),
      labels: counts(ir.policy.labels.map((label) => label.label)),
    },
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

  test("captures package resources, policy, and split hashes", async () => {
    const ir = await compilePackagePath(fixturePath("package-ir/contract-metadata"));

    expect(ir.resources.map((resource) => [resource.kind, resource.path, resource.exists])).toEqual([
      ["eval", "evals/brief.eval.prose.md", true],
      ["example", "examples/brief.run.json", true],
      ["schema", "schemas/brief.schema.json", true],
    ]);
    expect(ir.resources.find((resource) => resource.kind === "eval")?.component_ids).toEqual([
      "evals-brief-eval--brief-eval",
    ]);
    expect(ir.policy.effects.map((effect) => effect.kind)).toEqual([
      "read_external",
      "pure",
    ]);
    expect(ir.policy.access.map((entry) => entry.key)).toEqual([
      "callable_by",
      "reads",
    ]);
    expect(ir.policy.labels.map((label) => label.label)).toEqual([
      "admin",
      "company_private.accounts",
      "revenue",
    ]);
    expect(ir.hashes.semantic_hash).toBe(ir.semantic_hash);
    for (const hash of Object.values(ir.hashes)) {
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  test("keeps source hash distinct from package semantic hash", async () => {
    const root = mkdtempSync(join(tmpdir(), "openprose-package-hashes-"));
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, "prose.package.json"),
      JSON.stringify(
        {
          name: "@openprose/hash-demo",
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
      join(root, "brief.prose.md"),
      `---
name: brief
kind: service
---

### Ensures

- \`brief\`: Markdown<Brief> - brief output

### Effects

- \`pure\`: deterministic synthesis
`,
    );

    const before = await compilePackagePath(root);
    writeFileSync(
      join(root, "brief.prose.md"),
      `---
name: brief
kind: service
---


### Ensures

- \`brief\`: Markdown<Brief> - brief output

### Effects

- \`pure\`: deterministic synthesis
`,
    );
    const after = await compilePackagePath(root);

    expect(after.hashes.source_hash).not.toBe(before.hashes.source_hash);
    expect(after.hashes.semantic_hash).toBe(before.hashes.semantic_hash);
    expect(after.semantic_hash).toBe(before.semantic_hash);
  });
});
