import {
  compilePackagePath,
  describe,
  expect,
  join,
  mkdtempSync,
  readFileSync,
  runSource,
  test,
  tmpdir,
} from "./support";
import { scriptedPiRuntime } from "./support/scripted-pi-session";

const programPath = "packages/co/programs/company-repo-checker.prose.md";
const evalPath = "packages/co/evals/company-repo-checker.eval.prose.md";
const systemMapPath = "packages/co/programs/company-system-map.prose.md";
const systemMapEvalPath = "packages/co/evals/company-system-map.eval.prose.md";

const deterministicOutputs = {
  "repo-structure-inspector.source_layout": JSON.stringify({
    source_roots: ["systems", "shared"],
    legacy_roots: [],
  }),
  "repo-structure-inspector.source_layout_failures": "[]",
  "contract-eval-drift-inspector.contract_surface": JSON.stringify({
    executable_components: 4,
    evals: 4,
  }),
  "contract-eval-drift-inspector.contract_surface_failures": "[]",
  "dependency-graph-inspector.dependency_graph": JSON.stringify({
    edges: [],
    unresolved: [],
  }),
  "dependency-graph-inspector.dependency_graph_failures": "[]",
  "repo-readiness-reporter.report": JSON.stringify({
    passed: true,
    failures: [],
    counts: {
      executable_components: 4,
      evals: 4,
      dependency_edges: 0,
    },
  }),
  "repo-readiness-reporter.passed": "true",
  "repo-readiness-reporter.failures": "[]",
  verdict: JSON.stringify({
    passed: true,
    score: 0.94,
    verdict: "pass",
  }),
};

const systemMapOutputs = {
  "source-inventory-builder.source_inventory": JSON.stringify({
    source_roots: ["systems", "shared"],
    systems: ["distribution", "revenue"],
    shared_capabilities: ["enrichment"],
    records: ["records/decisions"],
    runtime_state: [".prose/runs"],
  }),
  "company-system-boundary-mapper.company_system_map": JSON.stringify({
    systems: [
      {
        name: "distribution",
        responsibilities: ["adoption intelligence"],
      },
      {
        name: "revenue",
        responsibilities: ["lead enrichment"],
      },
    ],
    shared_capabilities: ["enrichment"],
    adapters: ["github"],
    records: ["decisions"],
    ambiguous_boundaries: [],
  }),
  "workflow-surface-planner.workflow_surface": JSON.stringify({
    workflows: [
      {
        name: "intelligence-daily",
        trigger: "schedule",
        gate: "human_review",
        outputs: ["brief"],
      },
    ],
  }),
  "company-starter-reporter.starter_map": JSON.stringify({
    source_inventory: {
      source_roots: ["systems", "shared"],
      runtime_state: [".prose/runs"],
    },
    company_system_map: {
      systems: [
        { name: "distribution" },
        { name: "revenue" },
      ],
    },
    workflow_surface: {
      workflows: [
        { name: "intelligence-daily" },
      ],
    },
    unresolved_decisions: [],
  }),
  "company-starter-reporter.starter_next_actions": [
    "Start with distribution and revenue system READMEs.",
    "Add paired evals for the first recurring workflows.",
  ].join("\n"),
  verdict: JSON.stringify({
    passed: true,
    score: 0.92,
    verdict: "pass",
  }),
};

describe("OpenProse co package", () => {
  test("package IR has clean public returns and executable eval metadata", async () => {
    expect(readFileSync(join(import.meta.dir, "..", programPath), "utf8")).not.toContain(
      "runtime provider",
    );
    const ir = await compilePackagePath("packages/co");
    const evalComponent = ir.components.find((component) =>
      component.id.includes("company-repo-checker-eval"),
    );
    const systemMapEvalComponent = ir.components.find((component) =>
      component.id.includes("company-system-map-eval"),
    );
    const checkerReturnEdges = ir.graph.edges.filter((edge) =>
      edge.to.component === "$return" &&
      edge.from.component.startsWith("programs-company-repo-checker")
    );

    expect(ir.diagnostics).toEqual([]);
    expect(ir.manifest.evals).toEqual([
      "evals/company-repo-checker.eval.prose.md",
      "evals/company-system-map.eval.prose.md",
    ]);
    expect(evalComponent?.kind).toBe("test");
    expect(systemMapEvalComponent?.kind).toBe("test");
    expect(evalComponent?.ports.requires.map((port) => [port.name, port.type])).toEqual([
      ["subject", "Json<RunSubject>"],
      ["repo_snapshot", "Json<CompanyRepoSnapshot>"],
    ]);
    expect(evalComponent?.ports.ensures.map((port) => [port.name, port.type])).toEqual([
      ["verdict", "Json<CompanyRepoCheckerVerdict>"],
    ]);
    expect(checkerReturnEdges.map((edge) => [edge.from.component, edge.from.port]).sort()).toEqual([
      ["programs-company-repo-checker--repo-readiness-reporter", "failures"],
      ["programs-company-repo-checker--repo-readiness-reporter", "passed"],
      ["programs-company-repo-checker--repo-readiness-reporter", "report"],
    ]);
  });

  test("company repo checker runs through scripted Pi with required eval acceptance", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-co-scripted-")), "runs");
    const result = await runSource(readFileSync(join(import.meta.dir, "..", programPath), "utf8"), {
      path: programPath,
      nodeRunner: scriptedPiRuntime({
        outputs: deterministicOutputs,
      }),
      runRoot,
      runId: "co-scripted-smoke",
      inputs: {
        repo_path: "/tmp/company-as-code",
      },
      approvedEffects: ["read_external"],
      requiredEvals: [join(import.meta.dir, "..", evalPath)],
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.record.outputs.map((output) => output.port).sort()).toEqual([
      "failures",
      "passed",
      "report",
    ]);
    expect(result.record.evals).toEqual([
      expect.objectContaining({
        status: "passed",
        score: 0.94,
        required: true,
      }),
    ]);
  });

  test("company system map starter runs through scripted Pi with required eval acceptance", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-co-map-scripted-")), "runs");
    const result = await runSource(
      readFileSync(join(import.meta.dir, "..", systemMapPath), "utf8"),
      {
        path: systemMapPath,
        nodeRunner: scriptedPiRuntime({
          outputs: systemMapOutputs,
        }),
        runRoot,
        runId: "co-system-map-smoke",
        inputs: {
          company_context: "OpenProse builds managed agent systems.",
          repo_path: "/tmp/company-as-code",
          system_hints: '[{"name":"distribution"},{"name":"revenue"}]',
        },
        approvedEffects: ["read_external"],
        requiredEvals: [join(import.meta.dir, "..", systemMapEvalPath)],
      },
    );

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.record.outputs.map((output) => output.port).sort()).toEqual([
      "starter_map",
      "starter_next_actions",
    ]);
    expect(result.record.evals).toEqual([
      expect.objectContaining({
        status: "passed",
        score: 0.92,
        required: true,
      }),
    ]);
  });

});
