import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { compileFile } from "../src/compiler";
import { materializeFile } from "../src/materialize";
import { packagePath } from "../src/package";
import { planFile } from "../src/plan";
import { publishCheckPath } from "../src/publish";

interface Timed<T> {
  elapsed_ms: number;
  value: T;
}

interface PackageSnapshot {
  label: string;
  path: string;
  package_name: string;
  version: string | null;
  components: number;
  quality_score: number;
  typed_port_coverage: number;
  effect_declaration_ratio: number;
  publish_status: string;
  strict_publish_status: string;
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const docsRoot = resolve(repoRoot, "docs", "measurements");
  const tempRoot = await mkdtemp(join(tmpdir(), "openprose-measure-"));

  try {
    const packageTargets = [
      { label: "examples", path: resolve(repoRoot, "examples") },
      { label: "packages/std", path: resolve(repoRoot, "packages", "std") },
      { label: "packages/co", path: resolve(repoRoot, "packages", "co") },
    ];

    const referenceCompanyPath = resolve(repoRoot, "..", "..", "..", "customers", "prose-openprose");
    if (existsSync(resolve(referenceCompanyPath, "prose.package.json"))) {
      packageTargets.push({
        label: "customers/prose-openprose",
        path: referenceCompanyPath,
      });
    }

    const packages: PackageSnapshot[] = [];
    for (const target of packageTargets) {
      const metadata = await packagePath(target.path);
      const publish = await publishCheckPath(target.path);
      const strictPublish = await publishCheckPath(target.path, { strict: true });
      packages.push({
        label: target.label,
        path: target.path,
        package_name: metadata.manifest.name,
        version: metadata.manifest.version,
        components: metadata.components.length,
        quality_score: metadata.quality.score,
        typed_port_coverage: metadata.quality.typed_port_coverage,
        effect_declaration_ratio: metadata.quality.effect_declaration_ratio,
        publish_status: publish.status,
        strict_publish_status: strictPublish.status,
      });
    }

    const helloPath = resolve(repoRoot, "examples", "hello.prose.md");
    const selectivePath = resolve(repoRoot, "examples", "selective-recompute.prose.md");
    const approvalPath = resolve(repoRoot, "examples", "approval-gated-release.prose.md");
    const runAwarePath = resolve(repoRoot, "examples", "run-aware-brief.prose.md");
    const companyIntakePath = resolve(repoRoot, "examples", "company-intake.prose.md");

    const helloCompile = await time(() => compileFile(helloPath));
    const companyGraphPlan = await time(() =>
      planFile(companyIntakePath, {
        inputs: {
          company_domain: "openprose.com",
          inbound_note: "Warm referral from an existing customer.",
        },
      }),
    );
    const runAwareCompile = await time(() => compileFile(runAwarePath));

    const baselineRun = await materializeFile(selectivePath, {
      runRoot: tempRoot,
      runId: "baseline-selective",
      createdAt: "2026-04-23T18:00:00.000Z",
      inputs: {
        draft: "A stable draft.",
        company: "openprose",
      },
      outputs: {
        summary: "A stable summary.",
        market_snapshot: "A stable market snapshot.",
      },
    });

    const fullRefresh = await time(() =>
      planFile(selectivePath, {
        inputs: {
          draft: "A stable draft.",
          company: "openprose-enterprise",
        },
        currentRunPath: baselineRun.run_dir,
      }),
    );

    const targetedRefresh = await time(() =>
      planFile(selectivePath, {
        inputs: {
          draft: "A stable draft.",
          company: "openprose-enterprise",
        },
        currentRunPath: baselineRun.run_dir,
        targetOutputs: ["summary"],
      }),
    );

    const approvalPlan = await time(() =>
      planFile(approvalPath, {
        inputs: {
          release_candidate: "v0.11.0",
        },
      }),
    );

    const report = {
      generated_at: new Date().toISOString(),
      packages,
      scenarios: {
        hello_compile: {
          elapsed_ms: round2(helloCompile.elapsed_ms),
          diagnostics: helloCompile.value.diagnostics.length,
          semantic_hash: helloCompile.value.semantic_hash,
        },
        company_intake_plan: {
          elapsed_ms: round2(companyGraphPlan.elapsed_ms),
          status: companyGraphPlan.value.status,
          nodes: companyGraphPlan.value.nodes.length,
          materialization_nodes: companyGraphPlan.value.materialization_set.nodes.length,
        },
        run_aware_brief: {
          elapsed_ms: round2(runAwareCompile.elapsed_ms),
          diagnostics: runAwareCompile.value.diagnostics.length,
          access_rule_groups: runAwareCompile.value.components[0]?.access
            ? Object.keys(runAwareCompile.value.components[0].access.rules).length
            : 0,
        },
        selective_recompute: {
          full_refresh_elapsed_ms: round2(fullRefresh.elapsed_ms),
          targeted_refresh_elapsed_ms: round2(targetedRefresh.elapsed_ms),
          full_refresh_nodes: fullRefresh.value.materialization_set.nodes,
          targeted_refresh_nodes: targetedRefresh.value.materialization_set.nodes,
          full_refresh_graph: fullRefresh.value.materialization_set.graph,
          targeted_refresh_graph: targetedRefresh.value.materialization_set.graph,
          saved_node_recomputes:
            fullRefresh.value.materialization_set.nodes.length -
            targetedRefresh.value.materialization_set.nodes.length,
          saved_graph_rewrite:
            Number(fullRefresh.value.materialization_set.graph) -
            Number(targetedRefresh.value.materialization_set.graph),
        },
        approval_gated_release: {
          elapsed_ms: round2(approvalPlan.elapsed_ms),
          status: approvalPlan.value.status,
          blocked_effect_nodes: approvalPlan.value.nodes
            .filter((node) => node.status === "blocked_effect")
            .map((node) => node.component_ref),
        },
      },
    };

    await mkdir(docsRoot, { recursive: true });
    await writeFile(join(docsRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(join(docsRoot, "latest.md"), renderMarkdownReport(report), "utf8");

    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function time<T>(work: () => Promise<T>): Promise<Timed<T>> {
  const start = performance.now();
  const value = await work();
  return {
    elapsed_ms: performance.now() - start,
    value,
  };
}

function renderMarkdownReport(report: {
  generated_at: string;
  packages: PackageSnapshot[];
  scenarios: {
    hello_compile: {
      elapsed_ms: number;
      diagnostics: number;
      semantic_hash: string;
    };
    company_intake_plan: {
      elapsed_ms: number;
      status: string;
      nodes: number;
      materialization_nodes: number;
    };
    run_aware_brief: {
      elapsed_ms: number;
      diagnostics: number;
      access_rule_groups: number;
    };
    selective_recompute: {
      full_refresh_elapsed_ms: number;
      targeted_refresh_elapsed_ms: number;
      full_refresh_nodes: string[];
      targeted_refresh_nodes: string[];
      full_refresh_graph: boolean;
      targeted_refresh_graph: boolean;
      saved_node_recomputes: number;
      saved_graph_rewrite: number;
    };
    approval_gated_release: {
      elapsed_ms: number;
      status: string;
      blocked_effect_nodes: string[];
    };
  };
}): string {
  const lines: string[] = [];
  lines.push("# OpenProse Measurement Report");
  lines.push("");
  lines.push(`Generated: ${report.generated_at}`);
  lines.push("");
  lines.push("## Package Health");
  lines.push("");
  lines.push("| Target | Components | Quality | Typed Ports | Effects | Publish | Strict |");
  lines.push("|---|---:|---:|---:|---:|---|---|");
  for (const snapshot of report.packages) {
    lines.push(
      `| ${snapshot.label} | ${snapshot.components} | ${snapshot.quality_score.toFixed(2)} | ${formatPercent(snapshot.typed_port_coverage)} | ${formatPercent(snapshot.effect_declaration_ratio)} | ${snapshot.publish_status} | ${snapshot.strict_publish_status} |`,
    );
  }
  lines.push("");
  lines.push("## Scenario Checks");
  lines.push("");
  lines.push("### Hello");
  lines.push(`- compile time: ${report.scenarios.hello_compile.elapsed_ms.toFixed(2)} ms`);
  lines.push(`- diagnostics: ${report.scenarios.hello_compile.diagnostics}`);
  lines.push("");
  lines.push("### Company Intake");
  lines.push(`- plan status: ${report.scenarios.company_intake_plan.status}`);
  lines.push(`- graph nodes: ${report.scenarios.company_intake_plan.nodes}`);
  lines.push(`- materialization set size: ${report.scenarios.company_intake_plan.materialization_nodes}`);
  lines.push("");
  lines.push("### Run-Aware Brief");
  lines.push(`- compile time: ${report.scenarios.run_aware_brief.elapsed_ms.toFixed(2)} ms`);
  lines.push(`- access rule groups: ${report.scenarios.run_aware_brief.access_rule_groups}`);
  lines.push("");
  lines.push("### Selective Recompute");
  lines.push(`- full refresh nodes: ${listOrNone(report.scenarios.selective_recompute.full_refresh_nodes)}`);
  lines.push(`- targeted summary nodes: ${listOrNone(report.scenarios.selective_recompute.targeted_refresh_nodes)}`);
  lines.push(`- saved node recomputes: ${report.scenarios.selective_recompute.saved_node_recomputes}`);
  lines.push(`- saved graph rewrites: ${report.scenarios.selective_recompute.saved_graph_rewrite}`);
  lines.push("");
  lines.push("### Approval-Gated Release");
  lines.push(`- plan status: ${report.scenarios.approval_gated_release.status}`);
  lines.push(`- blocked nodes: ${listOrNone(report.scenarios.approval_gated_release.blocked_effect_nodes)}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function listOrNone(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

await main();
