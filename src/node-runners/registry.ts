import {
  createPiNodeRunner,
  type PiNodeRunnerOptions,
  type PiThinkingLevel,
} from "./pi.js";
import {
  createScriptedPiRuntime,
} from "../runtime/pi/scripted.js";
import {
  resolveRuntimeProfile,
  type RuntimeProfileInput,
} from "../runtime/profiles.js";
import type { GraphVmKind, NodeRunner } from "./protocol.js";
import type { RuntimeProfile } from "../types.js";

export interface ResolveNodeRunnerOptions {
  graphVm?: GraphVmKind;
  nodeRunner?: NodeRunner;
  deterministicOutputs?: Record<string, string>;
  runtimeProfile?: RuntimeProfile | RuntimeProfileInput | null;
  env?: Record<string, string | undefined>;
}

export function resolveNodeRunner(
  options: ResolveNodeRunnerOptions = {},
): NodeRunner {
  const { graphVm, nodeRunner, env = Bun.env } = options;
  const deterministicOutputs = options.deterministicOutputs;
  if (nodeRunner) {
    return nodeRunner;
  }

  const requested = graphVm ?? (hasDeterministicOutputs(deterministicOutputs) ? "pi" : null);
  if (!requested) {
    throw new Error(
      "No OpenProse graph VM selected. Configure the Pi runtime profile, or provide deterministic --output values for local tests.",
    );
  }

  if (requested === "pi") {
    if (hasDeterministicOutputs(deterministicOutputs)) {
      return createScriptedPiRuntime({ outputs: deterministicOutputs });
    }
    return createPiNodeRunner(
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
): PiNodeRunnerOptions {
  return {
    agentDir: envString(env, "OPENPROSE_PI_AGENT_DIR"),
    sessionDir: envString(env, "OPENPROSE_PI_SESSION_DIR"),
    persistSessions: profile.persist_sessions,
    modelProvider: profile.model_provider ?? undefined,
    modelId: profile.model ?? undefined,
    apiKey: resolvePiApiKey(profile.model_provider, env),
    apiKeyProvider: envString(env, "OPENPROSE_PI_API_KEY_PROVIDER") ?? undefined,
    thinkingLevel: piThinkingLevel(profile.thinking),
    tools: profile.tools,
    subagentsEnabled: profile.subagents_enabled,
    subagentBackend: profile.subagent_backend,
    noTools: envNoTools(env, "OPENPROSE_PI_NO_TOOLS"),
    outputFiles: envJsonRecord(env, "OPENPROSE_NODE_OUTPUT_FILES"),
    timeoutMs: envNumber(env, "OPENPROSE_PI_TIMEOUT_MS"),
  };
}

function resolvePiApiKey(
  modelProvider: string | null,
  env: Record<string, string | undefined>,
): string | undefined {
  const explicit = envString(env, "OPENPROSE_PI_API_KEY");
  if (explicit) {
    return explicit;
  }
  if (modelProvider === "openrouter") {
    return envString(env, "OPENROUTER_API_KEY");
  }
  if (modelProvider === "openai" || modelProvider === "openai_compatible") {
    return envString(env, "OPENAI_API_KEY");
  }
  if (modelProvider === "anthropic") {
    return envString(env, "ANTHROPIC_API_KEY");
  }
  return undefined;
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
