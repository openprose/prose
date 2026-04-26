import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { createPiNodeRunner } from "../src/node-runners";
import { runFile } from "../src/run";
import { traceFile } from "../src/trace";
import type { RuntimeProfileInput } from "../src/runtime/profiles";
import type { Diagnostic, RunRecord } from "../src/types";

type SmokeTier = "cheap" | "medium" | "complex";
type SmokeStatus = "skipped" | "succeeded" | "failed" | "blocked";
type FailureClass =
  | null
  | "auth_missing"
  | "billing_or_quota"
  | "policy_blocked"
  | "model_error"
  | "graph_vm_error"
  | "timeout"
  | "runtime_contract"
  | "runtime_exception";

interface LiveSmokeScenario {
  tier: SmokeTier;
  label: string;
  sourcePath: string;
  inputs: Record<string, string>;
  approvedEffects?: string[];
  model?: string;
}

interface LiveSmokeResult {
  tier: SmokeTier;
  label: string;
  source: string;
  status: SmokeStatus;
  failure_class: FailureClass;
  duration_ms: number;
  run_id: string | null;
  run_dir: string | null;
  session_count: number;
  trace_events: number;
  diagnostics: Array<{ code: string; message: string }>;
}

interface LiveSmokeReport {
  live_pi_smoke_version: "0.1";
  generated_at: string;
  enabled: boolean;
  selected_tiers: SmokeTier[];
  model_provider: string;
  model: string;
  run_root: string;
  results: LiveSmokeResult[];
  status: SmokeStatus;
}

interface CliOptions {
  tier: SmokeTier | "all";
  out: string;
  runRoot: string | null;
  allowFailure: boolean;
  enabled: boolean;
}

async function main(): Promise<void> {
  const repoRoot = resolve(import.meta.dir, "..");
  const options = parseArgs(Bun.argv.slice(2), repoRoot);
  const tempRoot = options.runRoot
    ? null
    : await mkdtemp(join(tmpdir(), "openprose-live-pi-smoke-"));
  const runRoot = options.runRoot ?? join(tempRoot ?? repoRoot, "runs");
  const modelProvider = envString("OPENPROSE_LIVE_PI_MODEL_PROVIDER")
    ?? envString("OPENPROSE_PI_MODEL_PROVIDER")
    ?? "openrouter";
  const model = envString("OPENPROSE_LIVE_PI_MODEL_ID")
    ?? envString("OPENPROSE_PI_MODEL_ID")
    ?? "google/gemini-3-flash-preview";

  try {
    const selected = selectedScenarios(
      await scenarios(repoRoot, model),
      options.tier,
    );
    const results = options.enabled
      ? await runLiveScenarios({
          repoRoot,
          scenarios: selected,
          runRoot,
          modelProvider,
          defaultModel: model,
        })
      : selected.map((scenario) => skippedResult(scenario, runRoot));
    const report: LiveSmokeReport = {
      live_pi_smoke_version: "0.1",
      generated_at: new Date().toISOString(),
      enabled: options.enabled,
      selected_tiers: selected.map((scenario) => scenario.tier),
      model_provider: modelProvider,
      model,
      run_root: runRoot,
      results,
      status: aggregateStatus(results),
    };

    await writeReport(options.out, report);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

    if (!options.allowFailure && report.status !== "succeeded" && options.enabled) {
      process.exitCode = 1;
    }
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function runLiveScenarios(options: {
  repoRoot: string;
  scenarios: LiveSmokeScenario[];
  runRoot: string;
  modelProvider: string;
  defaultModel: string;
}): Promise<LiveSmokeResult[]> {
  const apiKey = apiKeyForProvider(options.modelProvider);
  if (!apiKey) {
    return options.scenarios.map((scenario) =>
      blockedResult(scenario, options.runRoot, "auth_missing", [
        {
          code: "live_pi_auth_missing",
          message:
            "Set OPENPROSE_PI_API_KEY or provider-specific key such as OPENROUTER_API_KEY.",
        },
      ]),
    );
  }

  const agentDir = await prepareLivePiAgentDir({
    repoRoot: options.repoRoot,
    modelProvider: options.modelProvider,
    model: options.defaultModel,
  });
  const results: LiveSmokeResult[] = [];
  for (const scenario of options.scenarios) {
    results.push(
      await runLiveScenario({
        scenario,
        runRoot: options.runRoot,
        modelProvider: options.modelProvider,
        model: scenario.model ?? options.defaultModel,
        apiKey,
        agentDir,
      }),
    );
  }
  return results;
}

async function runLiveScenario(options: {
  scenario: LiveSmokeScenario;
  runRoot: string;
  modelProvider: string;
  model: string;
  apiKey: string;
  agentDir: string | undefined;
}): Promise<LiveSmokeResult> {
  const started = performance.now();
  const runId = [
    "live-pi",
    options.scenario.tier,
    slug(options.scenario.label),
    timestampSlug(new Date()),
  ].join("-");
  try {
    const result = await runFile(options.scenario.sourcePath, {
      runRoot: options.runRoot,
      runId,
      inputs: options.scenario.inputs,
      approvedEffects: options.scenario.approvedEffects ?? [],
      nodeRunner: createPiNodeRunner({
        modelProvider: options.modelProvider,
        modelId: options.model,
        apiKey: options.apiKey,
        apiKeyProvider: options.modelProvider,
        timeoutMs: envNumber("OPENPROSE_LIVE_PI_TIMEOUT_MS") ?? 180_000,
        agentDir: options.agentDir,
        sessionDir: envString("OPENPROSE_PI_SESSION_DIR"),
        persistSessions: true,
      }),
      runtimeProfile: runtimeProfile(options.modelProvider, options.model),
    });
    const trace = existsSync(join(result.run_dir, "trace.json"))
      ? await traceFile(result.run_dir)
      : null;
    const failure = failureClass(result.record, result.diagnostics);
    return {
      tier: options.scenario.tier,
      label: options.scenario.label,
      source: relativeSource(options.scenario.sourcePath),
      status: result.record.status === "succeeded" ? "succeeded" : "failed",
      failure_class: result.record.status === "succeeded" ? null : failure,
      duration_ms: elapsed(started),
      run_id: result.run_id,
      run_dir: result.run_dir,
      session_count: trace ? sessionCount(trace.events) : 0,
      trace_events: trace?.events.length ?? 0,
      diagnostics: diagnostics(result.diagnostics),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      tier: options.scenario.tier,
      label: options.scenario.label,
      source: relativeSource(options.scenario.sourcePath),
      status: "failed",
      failure_class: exceptionFailureClass(message),
      duration_ms: elapsed(started),
      run_id: runId,
      run_dir: join(options.runRoot, runId),
      session_count: 0,
      trace_events: 0,
      diagnostics: [
        {
          code: "live_pi_runtime_exception",
          message,
        },
      ],
    };
  }
}

async function scenarios(
  repoRoot: string,
  defaultModel: string,
): Promise<LiveSmokeScenario[]> {
  const northStarRoot = resolve(repoRoot, "examples", "north-star");
  const fixtureRoot = resolve(northStarRoot, "fixtures");
  return [
    {
      tier: "cheap",
      label: "company-signal-brief",
      sourcePath: resolve(northStarRoot, "company-signal-brief.prose.md"),
      inputs: {
        signal_notes: await fixture(fixtureRoot, "company-signal-brief/happy.signal-notes.md"),
        brand_context: await fixture(fixtureRoot, "company-signal-brief/happy.brand-context.md"),
      },
    },
    {
      tier: "medium",
      label: "lead-program-designer",
      sourcePath: resolve(northStarRoot, "lead-program-designer.prose.md"),
      inputs: {
        lead_profile: await fixture(fixtureRoot, "lead-program-designer/happy.lead-profile.json"),
        brand_context: await fixture(fixtureRoot, "lead-program-designer/happy.brand-context.md"),
      },
    },
    {
      tier: "complex",
      label: "stargazer-intake-lite",
      sourcePath: resolve(northStarRoot, "stargazer-intake-lite.prose.md"),
      inputs: {
        stargazer_batch: await fixture(
          fixtureRoot,
          "stargazer-intake-lite/duplicate-high-water.stargazer-batch.json",
        ),
        prior_stargazer_memory: await fixture(
          fixtureRoot,
          "stargazer-intake-lite/happy.prior-stargazer-memory.json",
        ),
      },
      approvedEffects: ["writes_memory"],
      model: envString("OPENPROSE_LIVE_PI_COMPLEX_MODEL_ID") ?? defaultModel,
    },
  ];
}

function selectedScenarios(
  scenarios: LiveSmokeScenario[],
  tier: SmokeTier | "all",
): LiveSmokeScenario[] {
  return tier === "all"
    ? scenarios
    : scenarios.filter((scenario) => scenario.tier === tier);
}

function parseArgs(args: string[], repoRoot: string): CliOptions {
  const parsed: CliOptions = {
    tier: "cheap",
    out: resolve(repoRoot, "docs", "measurements", "live-pi.latest.json"),
    runRoot: null,
    allowFailure: false,
    enabled: Bun.env.OPENPROSE_LIVE_PI_SMOKE === "1",
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--tier") {
      parsed.tier = parseTier(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === "--out") {
      parsed.out = resolve(args[index + 1] ?? parsed.out);
      index += 1;
      continue;
    }
    if (arg === "--run-root") {
      parsed.runRoot = resolve(args[index + 1] ?? ".prose/live-pi-runs");
      index += 1;
      continue;
    }
    if (arg === "--allow-failure") {
      parsed.allowFailure = true;
      continue;
    }
    if (arg === "--enable") {
      parsed.enabled = true;
      continue;
    }
    if (arg === "--skip") {
      parsed.enabled = false;
    }
  }

  return parsed;
}

function parseTier(value: string | undefined): SmokeTier | "all" {
  if (value === "cheap" || value === "medium" || value === "complex" || value === "all") {
    return value;
  }
  throw new Error("--tier must be one of cheap, medium, complex, all.");
}

function runtimeProfile(modelProvider: string, model: string): RuntimeProfileInput {
  return {
    graph_vm: "pi",
    model_provider: modelProvider,
    model,
    thinking: envString("OPENPROSE_LIVE_PI_THINKING_LEVEL")
      ?? envString("OPENPROSE_PI_THINKING_LEVEL")
      ?? "off",
    tools: ["read", "write"],
    persist_sessions: true,
  };
}

async function prepareLivePiAgentDir(options: {
  repoRoot: string;
  modelProvider: string;
  model: string;
}): Promise<string | undefined> {
  const explicitAgentDir = envString("OPENPROSE_PI_AGENT_DIR");
  if (explicitAgentDir) {
    return explicitAgentDir;
  }
  if (options.modelProvider !== "openrouter") {
    return undefined;
  }

  const agentDir = resolve(options.repoRoot, ".prose", "live-pi-agent");
  await mkdir(agentDir, { recursive: true });
  await writeFile(
    join(agentDir, "models.json"),
    `${JSON.stringify(openRouterModelsJson(options.model), null, 2)}\n`,
    "utf8",
  );
  return agentDir;
}

function openRouterModelsJson(model: string): object {
  return {
    providers: {
      openrouter: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "OPENROUTER_API_KEY",
        api: "openai-completions",
        models: [
          {
            id: model,
            name: `OpenRouter ${model}`,
            input: ["text"],
            reasoning: false,
            contextWindow: 128000,
            maxTokens: 8192,
            cost: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
            },
          },
        ],
      },
    },
  };
}

function apiKeyForProvider(modelProvider: string): string | null {
  return envString("OPENPROSE_PI_API_KEY")
    ?? (modelProvider === "openrouter" ? envString("OPENROUTER_API_KEY") : null)
    ?? envString(`${modelProvider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`)
    ?? null;
}

function skippedResult(
  scenario: LiveSmokeScenario,
  runRoot: string,
): LiveSmokeResult {
  return blockedResult(scenario, runRoot, null, []);
}

function blockedResult(
  scenario: LiveSmokeScenario,
  runRoot: string,
  failureClass: FailureClass,
  diagnostics: LiveSmokeResult["diagnostics"],
): LiveSmokeResult {
  return {
    tier: scenario.tier,
    label: scenario.label,
    source: relativeSource(scenario.sourcePath),
    status: failureClass ? "blocked" : "skipped",
    failure_class: failureClass,
    duration_ms: 0,
    run_id: null,
    run_dir: runRoot,
    session_count: 0,
    trace_events: 0,
    diagnostics,
  };
}

async function writeReport(path: string, report: LiveSmokeReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath(path), renderMarkdown(report), "utf8");
}

function renderMarkdown(report: LiveSmokeReport): string {
  const lines = ["# OpenProse Live Pi Smoke Report", ""];
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Enabled: ${report.enabled ? "yes" : "no"}`);
  lines.push(`Model: ${report.model_provider}/${report.model}`);
  lines.push(`Run root: ${report.run_root}`);
  lines.push("");
  lines.push("| Tier | Scenario | Status | Failure | Sessions | Trace Events |");
  lines.push("|---|---|---|---|---:|---:|");
  for (const result of report.results) {
    lines.push(
      `| ${result.tier} | ${result.label} | ${result.status} | ${result.failure_class ?? ""} | ${result.session_count} | ${result.trace_events} |`,
    );
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function markdownPath(path: string): string {
  return path.endsWith(".json")
    ? `${path.slice(0, -".json".length)}.md`
    : `${path}.${basename(path)}.md`;
}

function aggregateStatus(results: LiveSmokeResult[]): SmokeStatus {
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

function failureClass(record: RunRecord, diagnostics: Diagnostic[]): FailureClass {
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

function exceptionFailureClass(message: string): FailureClass {
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

function diagnostics(input: Diagnostic[]): LiveSmokeResult["diagnostics"] {
  return input
    .filter((diagnostic) => diagnostic.severity !== "info")
    .map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
    }));
}

function sessionCount(events: Array<{ event: string }>): number {
  return events.filter((event) => event.event === "node_session.started").length;
}

async function fixture(root: string, path: string): Promise<string> {
  return readFile(resolve(root, path), "utf8");
}

function relativeSource(path: string): string {
  const repoRoot = resolve(import.meta.dir, "..");
  return path.startsWith(repoRoot)
    ? path.slice(repoRoot.length + 1)
    : path;
}

function envString(name: string): string | null {
  const value = Bun.env[name];
  return value && value.trim().length > 0 ? value : null;
}

function envNumber(name: string): number | null {
  const value = envString(name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
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
