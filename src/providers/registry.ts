import {
  createPiProvider,
  type PiProviderOptions,
  type PiThinkingLevel,
} from "./pi.js";
import {
  createScriptedPiRuntime,
} from "../runtime/pi/scripted.js";
import {
  resolveRuntimeProfile,
  type RuntimeProfileInput,
} from "../runtime/profiles.js";
import type { ProviderKind, RuntimeProvider } from "./protocol.js";
import type { RuntimeProfile } from "../types.js";

export interface ResolveRuntimeProviderOptions {
  provider?: ProviderKind | RuntimeProvider;
  deterministicOutputs?: Record<string, string>;
  runtimeProfile?: RuntimeProfile | RuntimeProfileInput | null;
  env?: Record<string, string | undefined>;
}

export function resolveRuntimeProvider(
  options: ResolveRuntimeProviderOptions = {},
): RuntimeProvider {
  const { provider, env = Bun.env } = options;
  const deterministicOutputs = options.deterministicOutputs;
  if (typeof provider === "object" && provider) {
    return provider;
  }

  const requested = provider ?? (hasDeterministicOutputs(deterministicOutputs) ? "pi" : null);
  if (!requested) {
    throw new Error(
      "No OpenProse graph VM selected. Configure the Pi runtime profile, or provide deterministic --output values for local tests.",
    );
  }

  if (requested === "fixture") {
    throw new Error(
      "The fixture graph VM has been removed. Deterministic --output values now run through an internal scripted Pi session.",
    );
  }

  if (requested === "pi") {
    if (hasDeterministicOutputs(deterministicOutputs)) {
      return createScriptedPiRuntime({ outputs: deterministicOutputs });
    }
    return createPiProvider(
      piOptionsFromProfile(
        resolveRuntimeProfile({
          profile: runtimeProfileInput(options.runtimeProfile),
          selectedGraphVm: "pi",
          deterministicOutputs,
          env,
        }),
        env,
      ),
    );
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

function hasDeterministicOutputs(outputs: Record<string, string> | undefined): boolean {
  return Boolean(outputs && Object.keys(outputs).length > 0);
}

function runtimeProfileInput(
  profile: RuntimeProfile | RuntimeProfileInput | null | undefined,
): RuntimeProfileInput | null {
  return profile ?? null;
}

function piOptionsFromProfile(
  profile: RuntimeProfile,
  env: Record<string, string | undefined>,
): PiProviderOptions {
  return {
    agentDir: envString(env, "OPENPROSE_PI_AGENT_DIR"),
    sessionDir: envString(env, "OPENPROSE_PI_SESSION_DIR"),
    persistSessions: profile.persist_sessions,
    modelProvider: profile.model_provider ?? undefined,
    modelId: profile.model ?? undefined,
    apiKey: envString(env, "OPENPROSE_PI_API_KEY"),
    apiKeyProvider: envString(env, "OPENPROSE_PI_API_KEY_PROVIDER") ?? undefined,
    thinkingLevel: piThinkingLevel(profile.thinking),
    tools: profile.tools,
    noTools: envNoTools(env, "OPENPROSE_PI_NO_TOOLS"),
    outputFiles: envJsonRecord(env, "OPENPROSE_PROVIDER_OUTPUT_FILES"),
    timeoutMs: envNumber(env, "OPENPROSE_PI_TIMEOUT_MS"),
  };
}

function piThinkingLevel(value: string | null): PiThinkingLevel | undefined {
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
  throw new Error("Runtime profile thinking must be one of off, minimal, low, medium, high, xhigh.");
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
