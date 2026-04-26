import {
  createFixtureProvider,
  type FixtureProviderOptions,
} from "./fixture.js";
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
      "No OpenProse graph VM selected. Configure the Pi runtime profile, or provide deterministic outputs for internal tests.",
    );
  }

  if (requested === "fixture") {
    return createFixtureProvider({ outputs: fixtureOutputs ?? {} });
  }

  if (requested === "pi") {
    return createPiProvider(piOptionsFromEnv(env));
  }

  if (requested === "openrouter" || requested === "openai_compatible") {
    throw new Error(
      `Provider '${requested}' is a model-provider profile, not an OpenProse graph VM. Configure it through OPENPROSE_PI_MODEL_PROVIDER and run with the Pi graph VM.`,
    );
  }

  if (requested === "local_process" || requested === "local-process") {
    throw new Error(
      "Command-style adapters are single-run harness integrations, not OpenProse graph VMs. Use the Pi graph VM for reactive graph execution.",
    );
  }

  throw new Error(
    `OpenProse graph VM '${requested}' is not registered. Available graph VMs: pi.`,
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
