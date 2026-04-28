import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createPiNodeRunner } from "../src/node-runners";
import { runFile } from "../src/run";
import { traceFile } from "../src/trace";
import {
  apiKeyForPiHarnessProvider,
  modelForPiHarnessTier,
  preparePiHarnessLiveAgentDir,
  publicPiHarnessPath,
  resolvePiHarnessLiveSuiteConfig,
  writeJsonAndMarkdownReport,
  type PiHarnessFailureClass,
  type PiHarnessLiveSuiteConfig,
  type PiHarnessLiveTier,
} from "../src/runtime/pi/live-suite/config";
import type { RuntimeProfileInput } from "../src/runtime/profiles";
import type { Diagnostic, RunRecord, TraceEvent } from "../src/types";

type HarnessStatus = "skipped" | "succeeded" | "failed" | "blocked";

interface PiHarnessScenario {
  tier: PiHarnessLiveTier;
  label: string;
  sourcePath: string;
  inputs: Record<string, string>;
  requiresOutputSubmission: boolean;
  requiresSubagentManifest: boolean;
}

interface PiHarnessScenarioResult {
  tier: PiHarnessLiveTier;
  label: string;
  source: string;
  model: string;
  status: HarnessStatus;
  failure_class: PiHarnessFailureClass;
  duration_ms: number;
  run_id: string | null;
  run_dir: string | null;
  session_count: number;
  output_submission_count: number;
  subagent_manifest_entries: number;
  trace_events: number;
  diagnostics: Array<{ code: string; message: string }>;
}

interface PiHarnessLiveReport {
  pi_harness_live_suite_version: "0.1";
  generated_at: string;
  enabled: boolean;
  selected_tiers: PiHarnessLiveTier[];
  model_provider: string;
  cheap_model: string;
  advanced_model: string;
  thinking_level: string;
  timeout_ms: number;
  max_cost_usd: number;
  run_root: string;
  results: PiHarnessScenarioResult[];
  status: HarnessStatus;
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const config = resolvePiHarnessLiveSuiteConfig({
    args: Bun.argv.slice(2),
    repoRoot,
  });

  const selected = scenarios(config).filter((scenario) =>
    config.selectedTiers.includes(scenario.tier)
  );
  const results = config.enabled
    ? await runLiveScenarios(config, selected)
    : selected.map((scenario) => skippedResult(config, scenario));
  const report = normalizeReportPaths({
    pi_harness_live_suite_version: "0.1",
    generated_at: new Date().toISOString(),
    enabled: config.enabled,
    selected_tiers: config.selectedTiers,
    model_provider: config.modelProvider,
    cheap_model: config.cheapModel,
    advanced_model: config.advancedModel,
    thinking_level: config.thinkingLevel,
    timeout_ms: config.timeoutMs,
    max_cost_usd: config.maxCostUsd,
    run_root: config.runRoot,
    results,
    status: aggregateStatus(results),
  }, config.repoRoot);

  await writeJsonAndMarkdownReport(config.out, report, renderMarkdown(report));
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

  if (!config.allowFailure && config.enabled && report.status !== "succeeded") {
    process.exitCode = 1;
  }
}

async function runLiveScenarios(
  config: PiHarnessLiveSuiteConfig,
  selected: PiHarnessScenario[],
): Promise<PiHarnessScenarioResult[]> {
  const apiKey = apiKeyForPiHarnessProvider(config.modelProvider);
  if (!apiKey) {
    return selected.map((scenario) =>
      blockedResult(config, scenario, "auth_missing", [
        {
          code: "pi_harness_auth_missing",
          message:
            "Set OPENPROSE_PI_API_KEY or provider-specific key such as OPENROUTER_API_KEY.",
        },
      ]),
    );
  }

  const agentDir = await preparePiHarnessLiveAgentDir(config);
  const results: PiHarnessScenarioResult[] = [];
  for (const scenario of selected) {
    results.push(
      await runLiveScenario({
        config,
        scenario,
        apiKey,
        agentDir,
      }),
    );
  }
  return results;
}

async function runLiveScenario(options: {
  config: PiHarnessLiveSuiteConfig;
  scenario: PiHarnessScenario;
  apiKey: string;
  agentDir: string | undefined;
}): Promise<PiHarnessScenarioResult> {
  const started = performance.now();
  const model = modelForPiHarnessTier(options.config, options.scenario.tier);
  const runId = [
    "pi-harness-live",
    options.scenario.tier,
    slug(options.scenario.label),
    timestampSlug(new Date()),
  ].join("-");

  try {
    const result = await runFile(options.scenario.sourcePath, {
      runRoot: options.config.runRoot,
      runId,
      inputs: options.scenario.inputs,
      approvedEffects: [],
      nodeRunner: createPiNodeRunner({
        modelProvider: options.config.modelProvider,
        modelId: model,
        apiKey: options.apiKey,
        apiKeyProvider: options.config.modelProvider,
        timeoutMs: options.config.timeoutMs,
        thinkingLevel: options.config.thinkingLevel,
        agentDir: options.agentDir,
        persistSessions: true,
      }),
      runtimeProfile: runtimeProfile(options.config, model),
    });
    const trace = existsSync(join(result.run_dir, "trace.json"))
      ? await traceFile(result.run_dir)
      : null;
    const manifestEntries = await privateManifestEntryCount(result.run_dir);
    const outputSubmissions = trace
      ? outputSubmissionCount(trace.events)
      : 0;
    const assertionDiagnostics = scenarioDiagnostics(options.scenario, {
      outputSubmissions,
      manifestEntries,
    });
    const diagnostics = [
      ...diagnosticsFromRun(result.diagnostics),
      ...assertionDiagnostics,
    ];
    const succeeded = result.record.status === "succeeded" &&
      assertionDiagnostics.length === 0;
    return {
      tier: options.scenario.tier,
      label: options.scenario.label,
      source: relativeSource(options.config.repoRoot, options.scenario.sourcePath),
      model,
      status: succeeded ? "succeeded" : "failed",
      failure_class: succeeded
        ? null
        : failureClass(result.record, result.diagnostics, assertionDiagnostics),
      duration_ms: elapsed(started),
      run_id: result.run_id,
      run_dir: result.run_dir,
      session_count: trace ? sessionCount(trace.events) : 0,
      output_submission_count: outputSubmissions,
      subagent_manifest_entries: manifestEntries,
      trace_events: trace?.events.length ?? 0,
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      tier: options.scenario.tier,
      label: options.scenario.label,
      source: relativeSource(options.config.repoRoot, options.scenario.sourcePath),
      model,
      status: "failed",
      failure_class: exceptionFailureClass(message),
      duration_ms: elapsed(started),
      run_id: runId,
      run_dir: join(options.config.runRoot, runId),
      session_count: 0,
      output_submission_count: 0,
      subagent_manifest_entries: 0,
      trace_events: 0,
      diagnostics: [
        {
          code: "pi_harness_runtime_exception",
          message,
        },
      ],
    };
  }
}

function scenarios(config: PiHarnessLiveSuiteConfig): PiHarnessScenario[] {
  const fixtureRoot = resolve(config.repoRoot, "fixtures", "pi-harness");
  return [
    {
      tier: "cheap",
      label: "output-tool-canary",
      sourcePath: resolve(fixtureRoot, "output-tool.prose.md"),
      inputs: {
        draft: "Draft: Local Pi harnesses should prove terminal tool use cheaply.",
      },
      requiresOutputSubmission: true,
      requiresSubagentManifest: false,
    },
    {
      tier: "cheap",
      label: "subagent-review-canary",
      sourcePath: resolve(fixtureRoot, "subagent-review.prose.md"),
      inputs: {
        draft:
          "Draft: Split a parent summary from child private review notes and keep scratch work private.",
      },
      requiresOutputSubmission: true,
      requiresSubagentManifest: true,
    },
    {
      tier: "advanced",
      label: "advanced-output-tool-canary",
      sourcePath: resolve(fixtureRoot, "output-tool.prose.md"),
      inputs: {
        draft: "Draft: Advanced model canary should keep the same harness contract.",
      },
      requiresOutputSubmission: true,
      requiresSubagentManifest: false,
    },
  ];
}

function runtimeProfile(
  config: PiHarnessLiveSuiteConfig,
  model: string,
): RuntimeProfileInput {
  return {
    graph_vm: "pi",
    model_provider: config.modelProvider,
    model,
    thinking: config.thinkingLevel,
    tools: ["read", "write"],
    persist_sessions: true,
    subagents: true,
  };
}

function skippedResult(
  config: PiHarnessLiveSuiteConfig,
  scenario: PiHarnessScenario,
): PiHarnessScenarioResult {
  return blockedResult(config, scenario, null, []);
}

function blockedResult(
  config: PiHarnessLiveSuiteConfig,
  scenario: PiHarnessScenario,
  failureClassValue: PiHarnessFailureClass,
  diagnostics: PiHarnessScenarioResult["diagnostics"],
): PiHarnessScenarioResult {
  return {
    tier: scenario.tier,
    label: scenario.label,
    source: relativeSource(config.repoRoot, scenario.sourcePath),
    model: modelForPiHarnessTier(config, scenario.tier),
    status: failureClassValue ? "blocked" : "skipped",
    failure_class: failureClassValue,
    duration_ms: 0,
    run_id: null,
    run_dir: config.runRoot,
    session_count: 0,
    output_submission_count: 0,
    subagent_manifest_entries: 0,
    trace_events: 0,
    diagnostics,
  };
}

function scenarioDiagnostics(
  scenario: PiHarnessScenario,
  observed: { outputSubmissions: number; manifestEntries: number },
): PiHarnessScenarioResult["diagnostics"] {
  const diagnostics: PiHarnessScenarioResult["diagnostics"] = [];
  if (scenario.requiresOutputSubmission && observed.outputSubmissions === 0) {
    diagnostics.push({
      code: "pi_harness_output_submission_missing",
      message: "Scenario succeeded without an accepted openprose_submit_outputs call.",
    });
  }
  if (scenario.requiresSubagentManifest && observed.manifestEntries === 0) {
    diagnostics.push({
      code: "pi_harness_subagent_manifest_missing",
      message: "Scenario did not record any private child-session state.",
    });
  }
  return diagnostics;
}

async function privateManifestEntryCount(runDir: string): Promise<number> {
  const manifests = await findFiles(runDir, "openprose-private-state.json");
  let count = 0;
  for (const manifest of manifests) {
    try {
      const parsed = JSON.parse(await readFile(manifest, "utf8")) as {
        entries?: unknown[];
      };
      count += parsed.entries?.length ?? 0;
    } catch {
      // Malformed manifests are surfaced through run diagnostics; keep counting robust.
    }
  }
  return count;
}

async function findFiles(root: string, basename: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...await findFiles(path, basename));
      continue;
    }
    if (entry.isFile() && entry.name === basename) {
      paths.push(path);
    }
  }
  return paths;
}

function renderMarkdown(report: PiHarnessLiveReport): string {
  const lines = ["# OpenProse Pi Harness Live Suite", ""];
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Enabled: ${report.enabled ? "yes" : "no"}`);
  lines.push(`Model provider: ${report.model_provider}`);
  lines.push(`Cheap model: ${report.cheap_model}`);
  lines.push(`Advanced model: ${report.advanced_model}`);
  lines.push(`Run root: ${report.run_root}`);
  lines.push("");
  lines.push("| Tier | Scenario | Status | Failure | Sessions | Output submissions | Private entries |");
  lines.push("|---|---|---|---|---:|---:|---:|");
  for (const result of report.results) {
    lines.push(
      `| ${result.tier} | ${result.label} | ${result.status} | ${result.failure_class ?? ""} | ${result.session_count} | ${result.output_submission_count} | ${result.subagent_manifest_entries} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function normalizeReportPaths(
  report: PiHarnessLiveReport,
  repoRoot: string,
): PiHarnessLiveReport {
  return {
    ...report,
    run_root: publicPiHarnessPath(report.run_root, repoRoot),
    results: report.results.map((result) => ({
      ...result,
      run_dir: result.run_dir ? publicPiHarnessPath(result.run_dir, repoRoot) : null,
    })),
  };
}

function aggregateStatus(results: PiHarnessScenarioResult[]): HarnessStatus {
  if (results.some((result) => result.status === "failed")) {
    return "failed";
  }
  if (results.some((result) => result.status === "blocked")) {
    return "blocked";
  }
  if (results.every((result) => result.status === "skipped")) {
    return "skipped";
  }
  return "succeeded";
}

function failureClass(
  record: RunRecord,
  diagnostics: Diagnostic[],
  assertionDiagnostics: PiHarnessScenarioResult["diagnostics"],
): PiHarnessFailureClass {
  if (assertionDiagnostics.length > 0) {
    return "runtime_contract";
  }
  if (record.status === "blocked") {
    return "policy_blocked";
  }
  const codes = diagnostics.map((diagnostic) => diagnostic.code);
  const messages = diagnostics.map((diagnostic) => diagnostic.message).join("\n");
  if (isBillingOrQuota(messages)) {
    return "billing_or_quota";
  }
  if (codes.includes("pi_prompt_timeout")) {
    return "timeout";
  }
  if (codes.includes("pi_model_error")) {
    return "model_error";
  }
  if (codes.includes("pi_output_missing")) {
    return "runtime_contract";
  }
  if (codes.some((code) => code.startsWith("pi_"))) {
    return "graph_vm_error";
  }
  return "runtime_contract";
}

function exceptionFailureClass(message: string): PiHarnessFailureClass {
  const normalized = message.toLowerCase();
  if (isBillingOrQuota(normalized)) {
    return "billing_or_quota";
  }
  if (normalized.includes("api key") || normalized.includes("auth")) {
    return "auth_missing";
  }
  if (normalized.includes("model")) {
    return "model_error";
  }
  if (normalized.includes("timeout") || normalized.includes("timed out")) {
    return "timeout";
  }
  if (normalized.includes("pi")) {
    return "graph_vm_error";
  }
  return "runtime_exception";
}

function isBillingOrQuota(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("402") ||
    normalized.includes("credit") ||
    normalized.includes("quota") ||
    normalized.includes("billing")
  );
}

function diagnosticsFromRun(input: Diagnostic[]): PiHarnessScenarioResult["diagnostics"] {
  return input
    .filter((diagnostic) => diagnostic.severity !== "info")
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
    }));
}

function sessionCount(events: TraceEvent[]): number {
  return events.filter((event) => event.event === "node_session.started").length;
}

function outputSubmissionCount(events: TraceEvent[]): number {
  return events.filter((event) => event.event === "pi.output_submission.accepted").length;
}

function relativeSource(repoRoot: string, path: string): string {
  return path.startsWith(repoRoot) ? path.slice(repoRoot.length + 1) : path;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function timestampSlug(date: Date): string {
  return date.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
}

function elapsed(started: number): number {
  return Math.max(0, Math.round(performance.now() - started));
}

await main();
