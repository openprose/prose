import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

interface PackageHealthRow {
  label: string;
  components: number;
  quality_score: number;
  typed_port_coverage: number;
  effect_declaration_ratio: number;
  strict_publish_status: string;
}

interface GateRow {
  label: string;
  status: string;
  checks?: number;
  elapsed_ms?: number;
  detail?: string;
}

interface LaunchEvidenceReport {
  report_version: "0.2";
  generated_at: string;
  status: "pass" | "fail";
  source_reports: string[];
  package_health: PackageHealthRow[];
  confidence_gates: GateRow[];
  evidence_classes: unknown;
  scenario_signals: Record<string, unknown>;
  baseline_comparison: unknown;
  non_happy_path_semantics: {
    package_metadata: string[];
    runtime_channels: string[];
    hash_surface: string[];
  };
  technical_report_claims: string[];
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const docsRoot = resolve(repoRoot, "docs", "measurements");

  const measurement = await readJson(resolve(docsRoot, "latest.json")) as Record<string, any>;
  const runtimeConfidence = await readJson(
    resolve(docsRoot, "runtime-confidence.latest.json"),
  ) as Record<string, any>;
  const coldStart = await readJson(resolve(docsRoot, "cold-start.latest.json")) as Record<string, any>;
  const agentOnboarding = await readJson(
    resolve(docsRoot, "agent-onboarding.latest.json"),
  ) as Record<string, any>;
  const livePiPath = resolve(docsRoot, "live-pi.latest.json");
  const livePi = existsSync(livePiPath) ? await readJson(livePiPath) as Record<string, any> : null;

  const packageHealth = (measurement.packages ?? []).map((row: Record<string, any>) => ({
    label: String(row.label),
    components: Number(row.components),
    quality_score: Number(row.quality_score),
    typed_port_coverage: Number(row.typed_port_coverage),
    effect_declaration_ratio: Number(row.effect_declaration_ratio),
    strict_publish_status: String(row.strict_publish_status),
  }));

  const confidenceGates: GateRow[] = [
    {
      label: "runtime confidence",
      status: String(runtimeConfidence.status),
      checks: Number(runtimeConfidence.summary?.checks),
      elapsed_ms: Number(runtimeConfidence.summary?.elapsed_ms),
    },
    {
      label: "cold-start package smoke",
      status: String(coldStart.status),
      checks: Number(coldStart.summary?.checks),
      elapsed_ms: Number(coldStart.summary?.elapsed_ms),
    },
    {
      label: "agent onboarding smoke",
      status: String(agentOnboarding.status),
      checks: Number(agentOnboarding.summary?.checks),
      elapsed_ms: Number(agentOnboarding.summary?.elapsed_ms),
    },
    {
      label: "live Pi smoke",
      status: livePi ? String(livePi.status) : String(measurement.evidence?.live_pi?.status ?? "absent"),
      detail: livePi
        ? `${String(livePi.model_provider ?? "unknown")}/${String(livePi.model ?? "unknown")}`
        : String(measurement.evidence?.live_pi?.reason ?? "No live Pi report committed."),
    },
  ];

  const failed = confidenceGates.some((gate) => {
    if (gate.label === "live Pi smoke") {
      return false;
    }
    return gate.status !== "pass";
  });

  const report: LaunchEvidenceReport = {
    report_version: "0.2",
    generated_at: new Date().toISOString(),
    status: failed ? "fail" : "pass",
    source_reports: [
      "docs/measurements/latest.json",
      "docs/measurements/runtime-confidence.latest.json",
      "docs/measurements/cold-start.latest.json",
      "docs/measurements/agent-onboarding.latest.json",
      ...(livePi ? ["docs/measurements/live-pi.latest.json"] : []),
    ],
    package_health: packageHealth,
    confidence_gates: confidenceGates,
    evidence_classes: measurement.evidence,
    scenario_signals: measurement.scenarios ?? {},
    baseline_comparison: measurement.baseline_comparison,
    non_happy_path_semantics: {
      package_metadata: [
        "component contract metadata exposes strategies, declared terminal errors, finally obligations, catch guidance, and legacy invariant text when present",
        "catalog search entries include the same compact contract metadata so consumers can inspect non-happy-path semantics before install",
      ],
      runtime_channels: [
        "openprose_report_error records typed declared terminal failures",
        "openprose_submit_outputs and openprose_report_error both accept finally evidence",
        "catch remains intra-node recovery guidance rather than a graph-level scheduling edge",
      ],
      hash_surface: [
        "strategies, errors, finally, catch, and legacy invariants participate in source and package semantic hashes",
      ],
    },
    technical_report_claims: [
      "OpenProse packages expose typed ports and effect declarations at package scale.",
      "OpenProse package metadata exposes declared terminal errors, finally obligations, catch recovery guidance, and strategies for each component.",
      "Declared error/finally/catch/strategy sections participate in semantic hashes so registry consumers can detect behavior-changing contract updates.",
      "The runtime confidence gate exercises compile, plan, graph, run, trace, eval, remote envelope, package, publish-check, install, cold-start, and agent-onboarding paths.",
      "The examples measure selective recompute savings, approval visibility, duplicate suppression, and baseline skill-folder deltas.",
      "Live inference evidence is explicitly separated from deterministic local confidence.",
    ],
  };

  await mkdir(docsRoot, { recursive: true });
  await writeFile(
    resolve(docsRoot, "launch-evidence.latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    resolve(docsRoot, "launch-evidence.latest.md"),
    renderMarkdown(report),
    "utf8",
  );
  process.stdout.write(`${JSON.stringify({ status: report.status, gates: confidenceGates.length }, null, 2)}\n`);
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8"));
}

function renderMarkdown(report: LaunchEvidenceReport): string {
  const lines = [
    "# OpenProse Launch Evidence",
    "",
    `Generated: ${report.generated_at}`,
    `Status: ${report.status.toUpperCase()}`,
    "",
    "## Confidence Gates",
    "",
    "| Gate | Status | Checks | Elapsed | Detail |",
    "|---|---|---:|---:|---|",
  ];

  for (const gate of report.confidence_gates) {
    lines.push(
      `| ${gate.label} | ${gate.status} | ${gate.checks ?? ""} | ${gate.elapsed_ms ? `${gate.elapsed_ms}ms` : ""} | ${gate.detail ?? ""} |`,
    );
  }

  lines.push(
    "",
    "## Package Health",
    "",
    "| Package | Components | Quality | Typed Ports | Effects | Strict Publish |",
    "|---|---:|---:|---:|---:|---|",
  );

  for (const row of report.package_health) {
    lines.push(
      `| ${row.label} | ${row.components} | ${row.quality_score.toFixed(2)} | ${percent(row.typed_port_coverage)} | ${percent(row.effect_declaration_ratio)} | ${row.strict_publish_status} |`,
    );
  }

  lines.push("", "## Non-Happy-Path Semantics", "");
  lines.push("Package metadata:");
  for (const item of report.non_happy_path_semantics.package_metadata) {
    lines.push(`- ${item}`);
  }
  lines.push("", "Runtime channels:");
  for (const item of report.non_happy_path_semantics.runtime_channels) {
    lines.push(`- ${item}`);
  }
  lines.push("", "Hash surface:");
  for (const item of report.non_happy_path_semantics.hash_surface) {
    lines.push(`- ${item}`);
  }

  lines.push("", "## Technical Report Claims", "");
  for (const claim of report.technical_report_claims) {
    lines.push(`- ${claim}`);
  }

  lines.push("", "## Source Reports", "");
  for (const source of report.source_reports) {
    lines.push(`- \`${source}\``);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
