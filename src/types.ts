export type ComponentKind = "program" | "service" | "composite" | "test";

export interface SourceSpan {
  path: string;
  start_line: number;
  end_line: number;
}

export interface Diagnostic {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  source_span?: SourceSpan;
}

export interface PortIR {
  name: string;
  direction: "input" | "output";
  type: string;
  description: string;
  required: boolean;
  policy_labels: string[];
  source_span: SourceSpan;
}

export interface ServiceIR {
  name: string;
  ref: string;
  compose: string | null;
  with: Record<string, string | number | boolean>;
  source_span: SourceSpan;
}

export interface EnvironmentIR {
  name: string;
  description: string;
  required: boolean;
  source_span: SourceSpan;
}

export interface RuntimeSettingIR {
  key: string;
  value: string | number | boolean | string[];
  source_span: SourceSpan;
}

export interface EffectIR {
  kind: string;
  description: string;
  config: Record<string, string | number | boolean>;
  source_span: SourceSpan;
}

export interface AccessIR {
  rules: Record<string, string[]>;
  source_span?: SourceSpan;
}

export interface ExecutionIR {
  language: "prose";
  body: string;
  source_span: SourceSpan;
}

export interface ComponentIR {
  id: string;
  name: string;
  kind: ComponentKind;
  source: {
    path: string;
    span: SourceSpan;
  };
  ports: {
    requires: PortIR[];
    ensures: PortIR[];
  };
  services: ServiceIR[];
  schemas: unknown[];
  runtime: RuntimeSettingIR[];
  environment: EnvironmentIR[];
  execution: ExecutionIR | null;
  effects: EffectIR[];
  access: AccessIR;
  evals: unknown[];
  expansions: unknown[];
}

export interface GraphNodeIR {
  id: string;
  component: string;
  kind: ComponentKind;
  source_span: SourceSpan;
}

export interface GraphEdgeEndpointIR {
  component: string;
  port: string;
}

export interface GraphEdgeIR {
  from: GraphEdgeEndpointIR;
  to: GraphEdgeEndpointIR;
  kind: "exact" | "semantic" | "pinned" | "execution" | "caller" | "return";
  confidence: number;
  reason: string;
  source: "auto" | "wiring" | "execution";
}

export interface GraphIR {
  nodes: GraphNodeIR[];
  edges: GraphEdgeIR[];
}

export interface ProseIR {
  ir_version: "0.1";
  semantic_hash: string;
  package: {
    name: string;
    source_ref: string;
    source_sha: string;
    dependencies: Array<{
      package: string;
      sha: string;
      refs: string[];
      lock_ref: string | null;
    }>;
  };
  components: ComponentIR[];
  graph: GraphIR;
  diagnostics: Diagnostic[];
}

export type RunLifecycleStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export interface RunBindingRecord {
  port: string;
  value_hash: string;
  source_run_id: string | null;
  policy_labels: string[];
}

export interface RunOutputRecord {
  port: string;
  value_hash: string;
  artifact_ref: string;
  policy_labels: string[];
}

export interface RunEvalRecord {
  eval_ref: string;
  required: boolean;
  status: "passed" | "failed" | "skipped" | "pending";
}

export interface RunRecord {
  run_id: string;
  kind: "component" | "graph";
  component_ref: string;
  component_version: {
    source_sha: string;
    package_ref: string;
    ir_hash: string;
  };
  caller: {
    principal_id: string;
    tenant_id: string;
    roles: string[];
    trigger:
      | "manual"
      | "api"
      | "schedule"
      | "webhook"
      | "graph_recompute"
      | "human_gate"
      | "test";
  };
  runtime: {
    harness: string;
    worker_ref: string | null;
    model: string | null;
    environment_ref: string | null;
  };
  inputs: RunBindingRecord[];
  dependencies: Array<{
    package: string;
    sha: string;
  }>;
  effects: {
    declared: string[];
    performed: string[];
  };
  outputs: RunOutputRecord[];
  evals: RunEvalRecord[];
  acceptance: {
    status: "accepted" | "rejected" | "pending" | "not_required";
    reason: string | null;
  };
  trace_ref: string;
  status: RunLifecycleStatus;
  created_at: string;
  completed_at: string | null;
}

export interface MaterializedRun {
  run_id: string;
  run_dir: string;
  record: RunRecord;
  node_records: RunRecord[];
}

export interface PlanNode {
  node_id: string;
  component_ref: string;
  status: "current" | "ready" | "blocked_input" | "blocked_effect" | "skipped";
  stale_reasons: string[];
  blocked_reasons: string[];
  depends_on: string[];
  effects: string[];
  current_run_id: string | null;
}

export interface ExecutionPlan {
  plan_version: "0.1";
  component_ref: string;
  ir_hash: string;
  requested_outputs: string[];
  status: "current" | "ready" | "blocked";
  graph_stale_reasons: string[];
  graph_blocked_reasons: string[];
  materialization_set: {
    graph: boolean;
    nodes: string[];
  };
  nodes: PlanNode[];
  diagnostics: Diagnostic[];
}

export interface GraphViewNode {
  id: string;
  label: string;
  component_ref: string;
  kind: ComponentKind | "boundary";
  source: string | null;
  requires: string[];
  ensures: string[];
  effects: string[];
  access_labels: string[];
  status: PlanNode["status"] | "boundary";
  stale_reasons: string[];
  blocked_reasons: string[];
  selected: boolean;
}

export interface GraphViewEdge {
  from: string;
  to: string;
  from_port: string;
  to_port: string;
  kind: GraphEdgeIR["kind"];
  reason: string;
  confidence: number;
  source: GraphEdgeIR["source"];
}

export interface GraphView {
  graph_version: "0.1";
  component_ref: string;
  requested_outputs: string[];
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  diagnostics: Diagnostic[];
}

export interface TraceEvent {
  event: string;
  at: string;
  run_id: string;
  [key: string]: unknown;
}

export interface TraceNodeView {
  run_id: string;
  component_ref: string;
  status: RunLifecycleStatus;
  acceptance: RunRecord["acceptance"]["status"];
  outputs: string[];
  effects: string[];
}

export interface TraceView {
  trace_version: "0.1";
  run_id: string;
  component_ref: string;
  kind: RunRecord["kind"];
  status: RunLifecycleStatus;
  acceptance: RunRecord["acceptance"]["status"];
  runtime: RunRecord["runtime"];
  created_at: string;
  completed_at: string | null;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  nodes: TraceNodeView[];
  events: TraceEvent[];
}

export interface HighlightToken {
  line: number;
  start: number;
  end: number;
  scope: string;
  text: string;
}

export interface HighlightView {
  highlight_version: "0.1";
  path: string;
  tokens: HighlightToken[];
}

export interface HostedRuntimeMetadata {
  callable: boolean;
  endpoint: string;
  pricing: string;
  auth_required: boolean;
  auth_modes: string[];
  trace_available: boolean;
}

export interface PackageComponentMetadata {
  name: string;
  kind: ComponentKind;
  path: string;
  summary: string | null;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
  effects: string[];
  access: Record<string, string[]>;
  evals: string[];
  examples: string[];
  quality_score: number;
  ir_version: ProseIR["ir_version"];
  semantic_hash: string;
  source_sha: string;
  warnings: string[];
}

export interface PackageQualitySummary {
  score: number;
  component_count: number;
  typed_port_coverage: number;
  effect_declaration_ratio: number;
  eval_link_ratio: number;
  example_link_ratio: number;
  warnings: string[];
}

export interface PackageMetadata {
  package_version: "0.1";
  root: string;
  manifest: {
    name: string;
    version: string | null;
    catalog: string;
    registry_ref: string | null;
    description: string | null;
    license: string | null;
    source: {
      git: string | null;
      sha: string | null;
    };
    dependencies: ProseIR["package"]["dependencies"];
    schemas: string[];
    evals: string[];
    examples: string[];
    no_evals: boolean;
    hosted: HostedRuntimeMetadata | null;
  };
  components: PackageComponentMetadata[];
  diagnostics: Diagnostic[];
  quality: PackageQualitySummary;
}

export interface PublishCheckItem {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export interface PublishCheckResult {
  publish_check_version: "0.1";
  package_name: string;
  package_version: string | null;
  strict: boolean;
  status: "pass" | "warn" | "fail";
  blockers: string[];
  warnings: string[];
  checks: PublishCheckItem[];
  metadata: PackageMetadata;
}

export interface CatalogSearchEntry {
  catalog: string;
  package_registry_ref: string | null;
  component_registry_ref: string | null;
  package_name: string;
  package_version: string | null;
  package_root: string;
  component_name: string;
  component_kind: ComponentKind;
  component_path: string;
  summary: string | null;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
  effects: string[];
  quality_score: number;
}

export interface CatalogSearchResult {
  catalog_search_version: "0.1";
  root: string;
  package_count: number;
  filters: {
    type: string[];
    effect: string[];
    kind: ComponentKind | null;
    min_quality: number | null;
  };
  results: CatalogSearchEntry[];
}

export interface InstallResult {
  install_version: "0.1";
  registry_ref: string;
  package_name: string;
  package_version: string;
  source_git: string;
  source_sha: string;
  install_dir: string;
  component_file: string | null;
  lockfile_path: string;
}
