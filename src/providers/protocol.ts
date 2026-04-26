import { stableStringify } from "../hash.js";
import type {
  ComponentIR,
  Diagnostic,
  LocalArtifactRecord,
  RuntimeProfile,
  RunLifecycleStatus,
} from "../types.js";

export type ProviderKind =
  | "fixture"
  | "local_process"
  | "openai_compatible"
  | "openrouter"
  | "pi"
  | "opencode"
  | "codex_cli"
  | "claude_code"
  | (string & {});

export interface ProviderSessionRef {
  provider: ProviderKind;
  session_id: string;
  url: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface ProviderInputBinding {
  port: string;
  value: string | null;
  artifact: LocalArtifactRecord | null;
  source_run_id: string | null;
  policy_labels: string[];
}

export interface ProviderExpectedOutput {
  port: string;
  type: string;
  required: boolean;
  policy_labels: string[];
}

export interface ProviderEnvironmentBinding {
  name: string;
  required: boolean;
  value: string | null;
}

export interface ProviderValidationRule {
  kind: "schema" | "effect" | "policy" | "output";
  ref: string;
  required: boolean;
}

export interface ProviderRuntimePrompt {
  prompt_version: "0.1";
  kind: "node_envelope";
  text: string;
}

export interface ProviderRequest {
  provider_request_version: "0.1";
  request_id: string;
  provider: ProviderKind;
  runtime_profile: RuntimeProfile;
  runtime_prompt?: ProviderRuntimePrompt | null;
  component: ComponentIR;
  rendered_contract: string;
  input_bindings: ProviderInputBinding[];
  upstream_artifacts: LocalArtifactRecord[];
  workspace_path: string;
  environment: ProviderEnvironmentBinding[];
  approved_effects: string[];
  policy_labels: string[];
  expected_outputs: ProviderExpectedOutput[];
  validation: ProviderValidationRule[];
}

export interface ProviderArtifactResult {
  port: string;
  content: string | null;
  content_type: string;
  artifact_ref: string | null;
  content_hash: string | null;
  policy_labels: string[];
}

export interface ProviderCostTelemetry {
  currency: string;
  amount: number;
  items: Array<{
    label: string;
    quantity: number;
    unit: string;
  }>;
}

export interface ProviderLogs {
  stdout: string | null;
  stderr: string | null;
  transcript: string | null;
}

export interface ProviderTelemetryEvent {
  event: string;
  at: string;
  provider: ProviderKind;
  [key: string]: unknown;
}

export interface ProviderResult {
  provider_result_version: "0.1";
  request_id: string;
  status: RunLifecycleStatus;
  artifacts: ProviderArtifactResult[];
  performed_effects: string[];
  logs: ProviderLogs;
  diagnostics: Diagnostic[];
  session: ProviderSessionRef | null;
  cost: ProviderCostTelemetry | null;
  duration_ms: number | null;
  telemetry?: ProviderTelemetryEvent[];
}

export interface RuntimeProvider {
  kind: ProviderKind;
  execute(request: ProviderRequest): Promise<ProviderResult>;
}

export function normalizeProviderSessionRef(
  ref: ProviderSessionRef,
): ProviderSessionRef {
  return {
    provider: ref.provider,
    session_id: ref.session_id,
    url: ref.url ?? null,
    metadata: Object.fromEntries(
      Object.entries(ref.metadata ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export function serializeProviderSessionRef(ref: ProviderSessionRef): string {
  return stableStringify(normalizeProviderSessionRef(ref));
}

export function deserializeProviderSessionRef(source: string): ProviderSessionRef {
  return normalizeProviderSessionRef(JSON.parse(source) as ProviderSessionRef);
}
