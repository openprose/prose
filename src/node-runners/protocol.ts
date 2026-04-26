import { stableStringify } from "../hash.js";
import type {
  ComponentIR,
  Diagnostic,
  LocalArtifactRecord,
  RuntimeProfile,
  RunLifecycleStatus,
} from "../types.js";

export type GraphVmKind = "pi" | (string & {});

export interface NodeSessionRef {
  graph_vm: GraphVmKind;
  session_id: string;
  url: string | null;
  metadata: Record<string, string | number | boolean | null>;
}

export interface NodeInputBinding {
  port: string;
  value: string | null;
  artifact: LocalArtifactRecord | null;
  source_run_id: string | null;
  policy_labels: string[];
}

export interface NodeExpectedOutput {
  port: string;
  type: string;
  required: boolean;
  policy_labels: string[];
}

export interface NodeEnvironmentBinding {
  name: string;
  required: boolean;
  value: string | null;
}

export interface NodeValidationRule {
  kind: "schema" | "effect" | "policy" | "output";
  ref: string;
  required: boolean;
}

export interface NodeRuntimePrompt {
  prompt_version: "0.1";
  kind: "node_envelope";
  text: string;
}

export interface NodeRunRequest {
  node_run_request_version: "0.1";
  request_id: string;
  graph_vm: GraphVmKind;
  runtime_profile: RuntimeProfile;
  runtime_prompt?: NodeRuntimePrompt | null;
  component: ComponentIR;
  rendered_contract: string;
  input_bindings: NodeInputBinding[];
  upstream_artifacts: LocalArtifactRecord[];
  workspace_path: string;
  environment: NodeEnvironmentBinding[];
  approved_effects: string[];
  policy_labels: string[];
  expected_outputs: NodeExpectedOutput[];
  validation: NodeValidationRule[];
}

export interface NodeArtifactResult {
  port: string;
  content: string | null;
  content_type: string;
  artifact_ref: string | null;
  content_hash: string | null;
  policy_labels: string[];
}

export interface NodeCostTelemetry {
  currency: string;
  amount: number;
  items: Array<{
    label: string;
    quantity: number;
    unit: string;
  }>;
}

export interface NodeLogs {
  stdout: string | null;
  stderr: string | null;
  transcript: string | null;
}

export interface NodeTelemetryEvent {
  event: string;
  at: string;
  graph_vm: GraphVmKind;
  [key: string]: unknown;
}

export interface NodeRunResult {
  node_run_result_version: "0.1";
  request_id: string;
  status: RunLifecycleStatus;
  artifacts: NodeArtifactResult[];
  performed_effects: string[];
  logs: NodeLogs;
  diagnostics: Diagnostic[];
  session: NodeSessionRef | null;
  cost: NodeCostTelemetry | null;
  duration_ms: number | null;
  telemetry?: NodeTelemetryEvent[];
}

export interface NodeRunner {
  kind: GraphVmKind;
  execute(request: NodeRunRequest): Promise<NodeRunResult>;
}

export function normalizeNodeSessionRef(
  ref: NodeSessionRef,
): NodeSessionRef {
  return {
    graph_vm: ref.graph_vm,
    session_id: ref.session_id,
    url: ref.url ?? null,
    metadata: Object.fromEntries(
      Object.entries(ref.metadata ?? {}).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  };
}

export function serializeNodeSessionRef(ref: NodeSessionRef): string {
  return stableStringify(normalizeNodeSessionRef(ref));
}

export function deserializeNodeSessionRef(source: string): NodeSessionRef {
  return normalizeNodeSessionRef(JSON.parse(source) as NodeSessionRef);
}
