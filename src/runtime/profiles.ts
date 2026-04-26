import type { RuntimeProfile } from "../types.js";

export interface RuntimeProfileInput {
  profile_version?: "0.1";
  graph_vm?: string | null;
  graphVm?: string | null;
  single_run_harness?: string | null;
  singleRunHarness?: string | null;
  model_provider?: string | null;
  modelProvider?: string | null;
  model?: string | null;
  thinking?: string | null;
  tools?: string[] | null;
  persist_sessions?: boolean | null;
  persistSessions?: boolean | null;
}

export interface ResolveRuntimeProfileOptions {
  profile?: RuntimeProfileInput | null;
  selectedGraphVm?: string | null;
  deterministicOutputs?: Record<string, unknown> | undefined;
  env?: Record<string, string | undefined>;
}

const MODEL_PROVIDER_GRAPH_VMS = new Set(["openrouter", "openai_compatible"]);
const SINGLE_RUN_HARNESS_GRAPH_VMS = new Set([
  "local_process",
  "local-process",
  "opencode",
  "codex_cli",
  "claude_code",
]);

export function resolveRuntimeProfile(
  options: ResolveRuntimeProfileOptions = {},
): RuntimeProfile {
  const env = options.env ?? Bun.env;
  const input = options.profile ?? {};
  const hasDeterministicOutputs = hasOutputs(options.deterministicOutputs);
  const selectedGraphVm = normalizeString(options.selectedGraphVm);
  const requestedGraphVm = normalizeString(input.graph_vm ?? input.graphVm);
  if (requestedGraphVm && selectedGraphVm && requestedGraphVm !== selectedGraphVm) {
    throw new Error(
      `Runtime profile graph_vm '${requestedGraphVm}' conflicts with selected graph VM '${selectedGraphVm}'.`,
    );
  }
  const graphVm =
    requestedGraphVm ??
    graphVmFromSelectedRuntime(selectedGraphVm) ??
    "pi";

  assertGraphVm(graphVm);

  const profile: RuntimeProfile = {
    profile_version: "0.1",
    graph_vm: graphVm,
    single_run_harness:
      normalizeString(input.single_run_harness ?? input.singleRunHarness) ?? null,
    model_provider: hasDeterministicOutputs
      ? "scripted"
      : normalizeString(input.model_provider ?? input.modelProvider) ??
        envString(env, "OPENPROSE_PI_MODEL_PROVIDER"),
    model: hasDeterministicOutputs
      ? "deterministic-output"
      : normalizeString(input.model) ??
        envString(env, "OPENPROSE_PI_MODEL_ID"),
    thinking: hasDeterministicOutputs
      ? "off"
      : normalizeString(input.thinking) ??
        envString(env, "OPENPROSE_PI_THINKING_LEVEL"),
    tools:
      normalizeStringList(input.tools) ??
      envList(env, "OPENPROSE_PI_TOOLS") ??
      ["read", "write"],
    persist_sessions:
      normalizeBoolean(input.persist_sessions ?? input.persistSessions) ??
      envBoolean(env, "OPENPROSE_PI_PERSIST_SESSIONS") ??
      true,
  };

  assertThinking(profile.thinking);
  return profile;
}

export function runtimeProfileSummary(profile: RuntimeProfile): string {
  const model =
    profile.model_provider && profile.model
      ? `${profile.model_provider}/${profile.model}`
      : profile.model_provider ?? profile.model ?? "default model";
  return `${profile.graph_vm} (${model})`;
}

function graphVmFromSelectedRuntime(
  selected: string | null,
): string | null {
  if (selected) {
    return selected;
  }
  return null;
}

function assertGraphVm(graphVm: string): void {
  if (MODEL_PROVIDER_GRAPH_VMS.has(graphVm)) {
    throw new Error(
      `Runtime profile graph_vm '${graphVm}' is a model provider, not an OpenProse graph VM. Configure it as model_provider inside a Pi runtime profile.`,
    );
  }
  if (SINGLE_RUN_HARNESS_GRAPH_VMS.has(graphVm)) {
    throw new Error(
      `Runtime profile graph_vm '${graphVm}' is a single-run harness, not the reactive graph VM. Use graph_vm 'pi' and configure single_run_harness separately when needed.`,
    );
  }
  if (graphVm === "fixture") {
    throw new Error(
      "Runtime profile graph_vm 'fixture' has been removed. Use graph_vm 'pi'; deterministic --output runs use an internal scripted Pi session.",
    );
  }
}

function hasOutputs(outputs: Record<string, unknown> | undefined): boolean {
  return Boolean(outputs && Object.keys(outputs).length > 0);
}

function assertThinking(value: string | null): void {
  if (
    value === null ||
    value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  ) {
    return;
  }
  throw new Error("Runtime profile thinking must be one of off, minimal, low, medium, high, xhigh.");
}

function normalizeString(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeStringList(values: string[] | null | undefined): string[] | null {
  if (!values) {
    return null;
  }
  return Array.from(
    new Set(values.map((value) => normalizeString(value)).filter((value) => value !== null)),
  ).sort();
}

function normalizeBoolean(value: boolean | null | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function envString(
  env: Record<string, string | undefined>,
  name: string,
): string | null {
  return normalizeString(env[name]);
}

function envList(
  env: Record<string, string | undefined>,
  name: string,
): string[] | null {
  const value = envString(env, name);
  if (!value) {
    return null;
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort();
}

function envBoolean(
  env: Record<string, string | undefined>,
  name: string,
): boolean | null {
  const value = envString(env, name);
  if (!value) {
    return null;
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
