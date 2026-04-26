import {
  createFixtureProvider,
  type FixtureProviderOptions,
} from "./fixture.js";
import {
  createLocalProcessProvider,
  type LocalProcessProviderOptions,
} from "./local-process.js";
import {
  createOpenAICompatibleProvider,
  type OpenAICompatibleProviderOptions,
} from "./openai-compatible.js";
import {
  createPiProvider,
  type PiProviderOptions,
  type PiThinkingLevel,
} from "./pi.js";
import type { ProviderKind, RuntimeProvider } from "./protocol.js";

export interface ResolveRuntimeProviderOptions {
  provider?: ProviderKind | RuntimeProvider;
  fixtureOutputs?: FixtureProviderOptions["outputs"];
  env?: Record<string, string | undefined>;
}

export function resolveRuntimeProvider(
  options: ResolveRuntimeProviderOptions = {},
): RuntimeProvider {
  const { provider, fixtureOutputs, env = Bun.env } = options;
  if (typeof provider === "object" && provider) {
    return provider;
  }

  const requested = provider ?? (hasFixtureOutputs(fixtureOutputs) ? "fixture" : null);
  if (!requested) {
    throw new Error(
      "No runtime provider selected. Use --provider fixture with --output fixtures for deterministic local runs.",
    );
  }

  if (requested === "fixture") {
    return createFixtureProvider({ outputs: fixtureOutputs ?? {} });
  }

  if (requested === "pi") {
    return createPiProvider(piOptionsFromEnv(env));
  }

  if (requested === "openai_compatible") {
    return createOpenAICompatibleProvider(openAICompatibleOptionsFromEnv(env));
  }

  if (requested === "openrouter") {
    return createOpenAICompatibleProvider(openRouterOptionsFromEnv(env));
  }

  if (requested === "local_process" || requested === "local-process") {
    return createLocalProcessProvider(localProcessOptionsFromEnv(env));
  }

  throw new Error(
    `Provider '${requested}' is not registered. Available CLI providers: fixture, local_process, openai_compatible, openrouter, pi.`,
  );
}

function hasFixtureOutputs(outputs: FixtureProviderOptions["outputs"]): boolean {
  return Boolean(outputs && Object.keys(outputs).length > 0);
}

function piOptionsFromEnv(env: Record<string, string | undefined>): PiProviderOptions {
  return {
    agentDir: envString(env, "OPENPROSE_PI_AGENT_DIR"),
    sessionDir: envString(env, "OPENPROSE_PI_SESSION_DIR"),
    persistSessions: envBoolean(env, "OPENPROSE_PI_PERSIST_SESSIONS", false),
    modelProvider: envString(env, "OPENPROSE_PI_MODEL_PROVIDER"),
    modelId: envString(env, "OPENPROSE_PI_MODEL_ID"),
    apiKey: envString(env, "OPENPROSE_PI_API_KEY"),
    apiKeyProvider: envString(env, "OPENPROSE_PI_API_KEY_PROVIDER"),
    thinkingLevel: envThinkingLevel(env, "OPENPROSE_PI_THINKING_LEVEL"),
    tools: envList(env, "OPENPROSE_PI_TOOLS"),
    noTools: envNoTools(env, "OPENPROSE_PI_NO_TOOLS"),
    outputFiles: envJsonRecord(env, "OPENPROSE_PROVIDER_OUTPUT_FILES"),
    timeoutMs: envNumber(env, "OPENPROSE_PI_TIMEOUT_MS"),
  };
}

function localProcessOptionsFromEnv(
  env: Record<string, string | undefined>,
): LocalProcessProviderOptions {
  const command = envJsonArray(env, "OPENPROSE_LOCAL_PROCESS_COMMAND");
  if (!command) {
    throw new Error(
      "Provider 'local_process' requires OPENPROSE_LOCAL_PROCESS_COMMAND as a JSON string array.",
    );
  }
  return {
    command,
    timeoutMs: envNumber(env, "OPENPROSE_LOCAL_PROCESS_TIMEOUT_MS"),
    env: envJsonRecord(env, "OPENPROSE_LOCAL_PROCESS_ENV") ?? {},
    outputFiles: envJsonRecord(env, "OPENPROSE_PROVIDER_OUTPUT_FILES") ?? {},
    performedEffects: envList(env, "OPENPROSE_LOCAL_PROCESS_PERFORMED_EFFECTS") ?? [],
  };
}

function openAICompatibleOptionsFromEnv(
  env: Record<string, string | undefined>,
): OpenAICompatibleProviderOptions {
  const apiKey =
    envString(env, "OPENPROSE_OPENAI_COMPATIBLE_API_KEY") ??
    envString(env, "OPENAI_API_KEY") ??
    envString(env, "OPENROUTER_API_KEY");
  const model =
    envString(env, "OPENPROSE_OPENAI_COMPATIBLE_MODEL") ??
    envString(env, "OPENAI_MODEL") ??
    envString(env, "OPENROUTER_MODEL");
  const baseUrl =
    envString(env, "OPENPROSE_OPENAI_COMPATIBLE_BASE_URL") ??
    envString(env, "OPENAI_BASE_URL") ??
    (envString(env, "OPENROUTER_API_KEY") ? "https://openrouter.ai/api/v1" : undefined);
  if (!apiKey) {
    throw new Error(
      "Provider 'openai_compatible' requires OPENPROSE_OPENAI_COMPATIBLE_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY.",
    );
  }
  if (!model) {
    throw new Error(
      "Provider 'openai_compatible' requires OPENPROSE_OPENAI_COMPATIBLE_MODEL, OPENAI_MODEL, or OPENROUTER_MODEL.",
    );
  }
  if (!baseUrl) {
    throw new Error(
      "Provider 'openai_compatible' requires OPENPROSE_OPENAI_COMPATIBLE_BASE_URL or OPENAI_BASE_URL.",
    );
  }
  return {
    kind: "openai_compatible",
    apiKey,
    model,
    baseUrl,
    timeoutMs: envNumber(env, "OPENPROSE_OPENAI_COMPATIBLE_TIMEOUT_MS"),
    temperature: envOptionalNumber(env, "OPENPROSE_OPENAI_COMPATIBLE_TEMPERATURE"),
    maxTokens: envNumber(env, "OPENPROSE_OPENAI_COMPATIBLE_MAX_TOKENS"),
    appTitle: envString(env, "OPENPROSE_OPENAI_COMPATIBLE_APP_TITLE"),
    siteUrl: envString(env, "OPENPROSE_OPENAI_COMPATIBLE_SITE_URL"),
  };
}

function openRouterOptionsFromEnv(
  env: Record<string, string | undefined>,
): OpenAICompatibleProviderOptions {
  const apiKey =
    envString(env, "OPENROUTER_API_KEY") ??
    envString(env, "OPENPROSE_OPENAI_COMPATIBLE_API_KEY");
  if (!apiKey) {
    throw new Error(
      "Provider 'openrouter' requires OPENROUTER_API_KEY or OPENPROSE_OPENAI_COMPATIBLE_API_KEY.",
    );
  }
  return {
    kind: "openrouter",
    apiKey,
    model:
      envString(env, "OPENROUTER_MODEL") ??
      envString(env, "OPENPROSE_OPENAI_COMPATIBLE_MODEL") ??
      "google/gemini-3-flash-preview",
    baseUrl:
      envString(env, "OPENROUTER_BASE_URL") ??
      envString(env, "OPENPROSE_OPENAI_COMPATIBLE_BASE_URL") ??
      "https://openrouter.ai/api/v1",
    timeoutMs:
      envNumber(env, "OPENROUTER_TIMEOUT_MS") ??
      envNumber(env, "OPENPROSE_OPENAI_COMPATIBLE_TIMEOUT_MS"),
    temperature:
      envOptionalNumber(env, "OPENROUTER_TEMPERATURE") ??
      envOptionalNumber(env, "OPENPROSE_OPENAI_COMPATIBLE_TEMPERATURE"),
    maxTokens:
      envNumber(env, "OPENROUTER_MAX_TOKENS") ??
      envNumber(env, "OPENPROSE_OPENAI_COMPATIBLE_MAX_TOKENS"),
    appTitle:
      envString(env, "OPENROUTER_APP_TITLE") ??
      envString(env, "OPENPROSE_OPENAI_COMPATIBLE_APP_TITLE"),
    siteUrl:
      envString(env, "OPENROUTER_SITE_URL") ??
      envString(env, "OPENPROSE_OPENAI_COMPATIBLE_SITE_URL"),
  };
}

function envString(
  env: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const value = env[name];
  return value && value.trim().length > 0 ? value : undefined;
}

function envNumber(
  env: Record<string, string | undefined>,
  name: string,
): number | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function envOptionalNumber(
  env: Record<string, string | undefined>,
  name: string,
): number | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }
  return parsed;
}

function envBoolean(
  env: Record<string, string | undefined>,
  name: string,
  fallback: boolean,
): boolean {
  const value = envString(env, name);
  if (!value) {
    return fallback;
  }
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`${name} must be a boolean.`);
}

function envList(
  env: Record<string, string | undefined>,
  name: string,
): string[] | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function envNoTools(
  env: Record<string, string | undefined>,
  name: string,
): "all" | "builtin" | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
  if (value === "all" || value === "builtin") {
    return value;
  }
  throw new Error(`${name} must be "all" or "builtin".`);
}

function envThinkingLevel(
  env: Record<string, string | undefined>,
  name: string,
): PiThinkingLevel | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
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
  throw new Error(`${name} must be one of off, minimal, low, medium, high, xhigh.`);
}

function envJsonArray(
  env: Record<string, string | undefined>,
  name: string,
): string[] | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (
    Array.isArray(parsed) &&
    parsed.length > 0 &&
    parsed.every((entry) => typeof entry === "string")
  ) {
    return parsed;
  }
  throw new Error(`${name} must be a non-empty JSON array of strings.`);
}

function envJsonRecord(
  env: Record<string, string | undefined>,
  name: string,
): Record<string, string> | undefined {
  const value = envString(env, name);
  if (!value) {
    return undefined;
  }
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${name} must be a JSON object of strings.`);
  }
  const entries = Object.entries(parsed);
  if (entries.every(([, entry]) => typeof entry === "string")) {
    return Object.fromEntries(entries) as Record<string, string>;
  }
  throw new Error(`${name} must be a JSON object of strings.`);
}
