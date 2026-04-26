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
import { createLocalProcessProvider } from "../src/providers";

const programPath = "packages/co/programs/company-repo-checker.prose.md";
const evalPath = "packages/co/evals/company-repo-checker.eval.prose.md";

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

describe("OpenProse co package", () => {
  test("package IR has clean public returns and executable eval metadata", async () => {
    const ir = await compilePackagePath("packages/co");
    const evalComponent = ir.components.find((component) =>
      component.id.includes("company-repo-checker-eval"),
    );
    const returnEdges = ir.graph.edges.filter((edge) => edge.to.component === "$return");

    expect(ir.diagnostics).toEqual([]);
    expect(ir.manifest.evals).toEqual(["evals/company-repo-checker.eval.prose.md"]);
    expect(evalComponent?.kind).toBe("test");
    expect(evalComponent?.ports.requires.map((port) => [port.name, port.type])).toEqual([
      ["subject", "Json<RunSubject>"],
      ["repo_snapshot", "Json<CompanyRepoSnapshot>"],
    ]);
    expect(evalComponent?.ports.ensures.map((port) => [port.name, port.type])).toEqual([
      ["verdict", "Json<CompanyRepoCheckerVerdict>"],
    ]);
    expect(returnEdges.map((edge) => [edge.from.component, edge.from.port]).sort()).toEqual([
      ["programs-company-repo-checker--repo-readiness-reporter", "failures"],
      ["programs-company-repo-checker--repo-readiness-reporter", "passed"],
      ["programs-company-repo-checker--repo-readiness-reporter", "report"],
    ]);
  });

  test("company repo checker runs through scripted Pi with required eval acceptance", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-co-scripted-")), "runs");
    const result = await runSource(readFileSync(join(import.meta.dir, "..", programPath), "utf8"), {
      path: programPath,
      provider: scriptedPiRuntime({
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

  test("company repo checker can run through the local process provider", async () => {
    const runRoot = join(mkdtempSync(join(tmpdir(), "openprose-co-local-process-")), "runs");
    const provider = createLocalProcessProvider({
      command: [
        "bun",
        "--eval",
        [
          "await Bun.write('source_layout.md', '{\"source_roots\":[\"systems\",\"shared\"]}');",
          "await Bun.write('source_layout_failures.md', '[]');",
          "await Bun.write('contract_surface.md', '{\"executable_components\":4,\"evals\":4}');",
          "await Bun.write('contract_surface_failures.md', '[]');",
          "await Bun.write('dependency_graph.md', '{\"edges\":[],\"unresolved\":[]}');",
          "await Bun.write('dependency_graph_failures.md', '[]');",
          "await Bun.write('report.md', '{\"passed\":true,\"failures\":[]}');",
          "await Bun.write('passed.md', 'true');",
          "await Bun.write('failures.md', '[]');",
        ].join(" "),
      ],
      timeoutMs: 2_000,
    });

    const result = await runSource(readFileSync(join(import.meta.dir, "..", programPath), "utf8"), {
      path: programPath,
      provider,
      runRoot,
      runId: "co-local-process-smoke",
      inputs: {
        repo_path: "/tmp/company-as-code",
      },
      approvedEffects: ["read_external"],
    });

    expect(result.record.status).toBe("succeeded");
    expect(result.record.acceptance.status).toBe("accepted");
    expect(result.provider).toBe("local_process");
  });
});
