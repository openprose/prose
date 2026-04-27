import type { RuntimeProfile } from "../types.js";

export interface RuntimeProfileInput {
  profile_version?: "0.1";
  graph_vm?: string | null;
  graphVm?: string | null;
  execution_placement?: RuntimeProfile["execution_placement"] | null;
  executionPlacement?: RuntimeProfile["execution_placement"] | null;
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
    execution_placement:
      normalizeExecutionPlacement(input.execution_placement ?? input.executionPlacement) ??
      "local",
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
  if (graphVm !== "pi") {
    throw new Error(
      `Runtime profile graph_vm '${graphVm}' is not registered. Available graph VMs: pi.`,
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

function normalizeExecutionPlacement(
  value: RuntimeProfile["execution_placement"] | null | undefined,
): RuntimeProfile["execution_placement"] | null {
  if (
    value === "local" ||
    value === "workspace_capsule" ||
    value === "distributed"
  ) {
    return value;
  }
  if (value === null || value === undefined) {
    return null;
  }
  throw new Error(
    "Runtime profile execution_placement must be one of local, workspace_capsule, distributed.",
  );
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
