import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { PiThinkingLevel } from "../../../node-runners/pi.js";

export type PiHarnessLiveTier = "cheap" | "advanced";
export type PiHarnessLiveTierSelection = PiHarnessLiveTier | "all";

export type PiHarnessFailureClass =
  | null
  | "auth_missing"
  | "billing_or_quota"
  | "policy_blocked"
  | "model_error"
  | "graph_vm_error"
  | "timeout"
  | "runtime_contract"
  | "runtime_exception";

export interface PiHarnessLiveSuiteConfig {
  version: "0.1";
  repoRoot: string;
  enabled: boolean;
  tier: PiHarnessLiveTierSelection;
  selectedTiers: PiHarnessLiveTier[];
  out: string;
  runRoot: string;
  allowFailure: boolean;
  modelProvider: string;
  cheapModel: string;
  advancedModel: string;
  thinkingLevel: PiThinkingLevel;
  timeoutMs: number;
  maxCostUsd: number;
  agentDir: string;
}

export interface ResolvePiHarnessLiveSuiteConfigOptions {
  args?: string[];
  env?: Record<string, string | undefined>;
  repoRoot?: string;
}

const defaultCheapModel = "google/gemini-3-flash-preview";
const defaultAdvancedModel = "openai/gpt-5.5";
const defaultTimeoutMs = 180_000;
const defaultMaxCostUsd = 0.25;

export function resolvePiHarnessLiveSuiteConfig(
  options: ResolvePiHarnessLiveSuiteConfigOptions = {},
): PiHarnessLiveSuiteConfig {
  const env = options.env ?? Bun.env;
  const repoRoot = resolve(options.repoRoot ?? join(import.meta.dir, "../../../.."));
  const parsed = parseArgs(options.args ?? [], repoRoot, env);
  return {
    version: "0.1",
    repoRoot,
    enabled: parsed.enabled,
    tier: parsed.tier,
    selectedTiers: selectedTiers(parsed.tier),
    out: parsed.out,
    runRoot: parsed.runRoot,
    allowFailure: parsed.allowFailure,
    modelProvider:
      envString(env, "OPENPROSE_PI_HARNESS_MODEL_PROVIDER") ??
      envString(env, "OPENPROSE_LIVE_PI_MODEL_PROVIDER") ??
      envString(env, "OPENPROSE_PI_MODEL_PROVIDER") ??
      "openrouter",
    cheapModel:
      envString(env, "OPENPROSE_PI_HARNESS_CHEAP_MODEL_ID") ??
      envString(env, "OPENPROSE_LIVE_PI_MODEL_ID") ??
      envString(env, "OPENPROSE_PI_MODEL_ID") ??
      defaultCheapModel,
    advancedModel:
      envString(env, "OPENPROSE_PI_HARNESS_ADVANCED_MODEL_ID") ??
      envString(env, "OPENPROSE_LIVE_PI_ADVANCED_MODEL_ID") ??
      defaultAdvancedModel,
    thinkingLevel: parseThinkingLevel(
      envString(env, "OPENPROSE_PI_HARNESS_THINKING_LEVEL") ??
      envString(env, "OPENPROSE_LIVE_PI_THINKING_LEVEL") ??
      envString(env, "OPENPROSE_PI_THINKING_LEVEL") ??
      "off",
    ),
    timeoutMs:
      envNumber(env, "OPENPROSE_PI_HARNESS_TIMEOUT_MS") ??
      envNumber(env, "OPENPROSE_LIVE_PI_TIMEOUT_MS") ??
      defaultTimeoutMs,
    maxCostUsd:
      envNumber(env, "OPENPROSE_PI_HARNESS_MAX_COST_USD") ??
      defaultMaxCostUsd,
    agentDir:
      envString(env, "OPENPROSE_PI_AGENT_DIR") ??
      resolve(repoRoot, ".prose", "live-pi-agent"),
  };
}

export function modelForPiHarnessTier(
  config: PiHarnessLiveSuiteConfig,
  tier: PiHarnessLiveTier,
): string {
  return tier === "advanced" ? config.advancedModel : config.cheapModel;
}

export async function preparePiHarnessLiveAgentDir(
  config: PiHarnessLiveSuiteConfig,
): Promise<string | undefined> {
  if (config.modelProvider !== "openrouter") {
    return undefined;
  }
  await mkdir(config.agentDir, { recursive: true });
  await writeFile(
    join(config.agentDir, "models.json"),
    `${JSON.stringify(openRouterModelsJson([config.cheapModel, config.advancedModel]), null, 2)}\n`,
    "utf8",
  );
  return config.agentDir;
}

export function openRouterModelsJson(models: string | string[]): object {
  const modelIds = Array.from(new Set(Array.isArray(models) ? models : [models]));
  return {
    providers: {
      openrouter: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "OPENROUTER_API_KEY",
        api: "openai-completions",
        models: modelIds.map((model) => ({
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
        })),
      },
    },
  };
}

export function apiKeyForPiHarnessProvider(
  modelProvider: string,
  env: Record<string, string | undefined> = Bun.env,
): string | null {
  return envString(env, "OPENPROSE_PI_API_KEY")
    ?? (modelProvider === "openrouter" ? envString(env, "OPENROUTER_API_KEY") : null)
    ?? envString(env, `${modelProvider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`)
    ?? null;
}

export function markdownReportPath(path: string): string {
  return path.endsWith(".json")
    ? `${path.slice(0, -".json".length)}.md`
    : `${path}.md`;
}

export async function writeJsonAndMarkdownReport<T>(
  path: string,
  report: T,
  markdown: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownReportPath(path), markdown, "utf8");
}

export function publicPiHarnessPath(path: string, repoRoot: string): string {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedRepo = repoRoot.replace(/\\/g, "/");
  const normalizedTmp = tmpdir().replace(/\\/g, "/");
  if (normalizedPath === normalizedRepo) {
    return ".";
  }
  if (normalizedPath.startsWith(`${normalizedRepo}/`)) {
    return normalizedPath.slice(normalizedRepo.length + 1);
  }
  if (normalizedPath === normalizedTmp) {
    return "$TMP";
  }
  if (normalizedPath.startsWith(`${normalizedTmp}/`)) {
    return `$TMP/${normalizedPath.slice(normalizedTmp.length + 1)}`;
  }
  if (normalizedPath.startsWith("/tmp/")) {
    return `$TMP/${normalizedPath.slice("/tmp/".length)}`;
  }
  return "$ABSOLUTE_PATH";
}

interface ParsedArgs {
  enabled: boolean;
  tier: PiHarnessLiveTierSelection;
  out: string;
  runRoot: string;
  allowFailure: boolean;
}

function parseArgs(
  args: string[],
  repoRoot: string,
  env: Record<string, string | undefined>,
): ParsedArgs {
  const parsed: ParsedArgs = {
    enabled: envString(env, "OPENPROSE_PI_LIVE_SUITE") === "1",
    tier: "cheap",
    out: resolve(repoRoot, "docs", "measurements", "pi-harness-live.latest.json"),
    runRoot: resolve(repoRoot, ".prose", "pi-harness-live-runs"),
    allowFailure: false,
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
      parsed.runRoot = resolve(args[index + 1] ?? parsed.runRoot);
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

function selectedTiers(tier: PiHarnessLiveTierSelection): PiHarnessLiveTier[] {
  return tier === "all" ? ["cheap", "advanced"] : [tier];
}

function parseTier(value: string | undefined): PiHarnessLiveTierSelection {
  if (value === "cheap" || value === "advanced" || value === "all") {
    return value;
  }
  throw new Error("--tier must be one of cheap, advanced, all.");
}

function parseThinkingLevel(value: string): PiThinkingLevel {
  if (
    value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return value;
  }
  throw new Error(
    "OPENPROSE_PI_HARNESS_THINKING_LEVEL must be one of off, minimal, low, medium, high, xhigh.",
  );
}

function envString(
  env: Record<string, string | undefined>,
  name: string,
): string | null {
  const value = env[name];
  return value && value.trim().length > 0 ? value : null;
}

function envNumber(
  env: Record<string, string | undefined>,
  name: string,
): number | null {
  const value = envString(env, name);
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}
