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
  type_expr: TypeExpressionIR;
  description: string;
  required: boolean;
  policy_labels: string[];
  source_span: SourceSpan;
}

export type TypeExpressionKind = "primitive" | "named" | "array" | "generic";

export interface TypeExpressionIR {
  type_expr_version: "0.1";
  kind: TypeExpressionKind;
  raw: string;
  name: string;
  args: TypeExpressionIR[];
  element: TypeExpressionIR | null;
}

export interface ServiceIR {
  name: string;
  ref: string;
  compose: string | null;
  with: Record<string, string | number | boolean>;
  source_span: SourceSpan;
}

export interface CompositeExpansionIR {
  id: string;
  parent_component_id: string;
  service_name: string;
  compose_ref: string;
  with: Record<string, string | number | boolean>;
  status: "resolved" | "unresolved";
  resolved_component_id: string | null;
  source_span: SourceSpan;
  definition_source_span: SourceSpan | null;
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

export type ExecutionStepIR =
  | ExecutionCallStepIR
  | ExecutionParallelStepIR
  | ExecutionLoopStepIR
  | ExecutionConditionStepIR
  | ExecutionTryStepIR
  | ExecutionReturnStepIR
  | ExecutionTextStepIR;

export interface ExecutionStepBaseIR {
  kind: string;
  raw: string;
  source_span: SourceSpan;
}

export interface ExecutionCallStepIR extends ExecutionStepBaseIR {
  kind: "call";
  target: string;
  assign: string | null;
  bindings: Record<string, string>;
}

export interface ExecutionParallelStepIR extends ExecutionStepBaseIR {
  kind: "parallel";
  steps: ExecutionStepIR[];
}

export interface ExecutionLoopStepIR extends ExecutionStepBaseIR {
  kind: "loop";
  iterator: string | null;
  iterable: string | null;
  body: ExecutionStepIR[];
}

export interface ExecutionConditionStepIR extends ExecutionStepBaseIR {
  kind: "condition";
  condition: string;
  body: ExecutionStepIR[];
}

export interface ExecutionTryStepIR extends ExecutionStepBaseIR {
  kind: "try";
  body: ExecutionStepIR[];
}

export interface ExecutionReturnStepIR extends ExecutionStepBaseIR {
  kind: "return";
  value: string;
}

export interface ExecutionTextStepIR extends ExecutionStepBaseIR {
  kind: "text";
  text: string;
}

export interface ExecutionIR {
  language: "prose";
  body: string;
  steps: ExecutionStepIR[];
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
  expansions: CompositeExpansionIR[];
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

export type MetaOperationKindIR =
  | "intelligent_wiring"
  | "contract_repair"
  | "missing_metadata"
  | "eval_generation"
  | "failure_diagnosis";

export type MetaOperationProposalStateIR = "pending" | "accepted" | "rejected";

export type MetaOperationProposalPayloadIR =
  | MetaWiringProposalPayloadIR
  | MetaContractRepairProposalPayloadIR
  | MetaMissingMetadataProposalPayloadIR
  | MetaEvalGenerationProposalPayloadIR
  | MetaFailureDiagnosisProposalPayloadIR;

export interface MetaWiringProposalPayloadIR {
  kind: "graph_wiring";
  edge: GraphEdgeIR;
}

export interface MetaContractRepairProposalPayloadIR {
  kind: "contract_repair";
  component_id: string;
  summary: string;
  patch: string | null;
}

export interface MetaMissingMetadataProposalPayloadIR {
  kind: "missing_metadata";
  target: "package" | "component" | "port" | "effect" | "eval" | "example";
  component_id: string | null;
  field: string;
  suggested_value: unknown;
}

export interface MetaEvalGenerationProposalPayloadIR {
  kind: "eval_generation";
  subject_component_id: string;
  eval_name: string;
  criteria: string[];
}

export interface MetaFailureDiagnosisProposalPayloadIR {
  kind: "failure_diagnosis";
  run_id: string | null;
  component_id: string | null;
  diagnosis: string;
  suggested_next_step: string | null;
}

export interface MetaOperationEvidenceIR {
  kind: string;
  ref: string;
  summary: string;
}

export interface MetaOperationDecisionIR {
  decided_by: string;
  decided_at: string | null;
  reason: string;
}

export interface MetaOperationProposalIR {
  proposal_version: "0.1";
  id: string;
  kind: MetaOperationKindIR;
  state: MetaOperationProposalStateIR;
  title: string;
  rationale: string;
  created_by: "agent" | "human" | "runtime";
  created_at: string | null;
  evidence: MetaOperationEvidenceIR[];
  decision: MetaOperationDecisionIR | null;
  payload: MetaOperationProposalPayloadIR;
  source_span?: SourceSpan;
}

export interface PackageMetaIR {
  accepted_proposals: MetaOperationProposalIR[];
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

export interface PackageIRFile {
  path: string;
  source_sha: string;
  semantic_hash: string;
  component_ids: string[];
  diagnostics: Diagnostic[];
}

export type PackageResourceKindIR = "schema" | "eval" | "example";

export interface PackageResourceIR {
  kind: PackageResourceKindIR;
  path: string;
  source: "manifest";
  exists: boolean;
  source_sha: string | null;
  component_ids: string[];
  diagnostics: Diagnostic[];
}

export interface PackagePolicyEffectIR {
  component_id: string;
  component_name: string;
  kind: string;
  description: string;
  config: Record<string, string | number | boolean>;
  source_span: SourceSpan;
}

export interface PackagePolicyAccessIR {
  component_id: string;
  component_name: string;
  key: string;
  labels: string[];
  source_span?: SourceSpan;
}

export interface PackagePolicyLabelIR {
  label: string;
  source: "access" | "port";
  component_id: string;
  component_name: string;
  port: string | null;
  direction: "input" | "output" | null;
  access_key: string | null;
  source_span?: SourceSpan;
}

export interface PackagePolicyIR {
  effects: PackagePolicyEffectIR[];
  access: PackagePolicyAccessIR[];
  labels: PackagePolicyLabelIR[];
}

export interface PackageHashSetIR {
  source_hash: string;
  semantic_hash: string;
  dependency_hash: string;
  policy_hash: string;
  runtime_config_hash: string;
}

export interface PackageRuntimeManifest {
  graph_vm: string | null;
  model_providers: string[];
  default_model_provider: string | null;
  default_model: string | null;
  thinking: string | null;
  tools: string[];
  persist_sessions: boolean | null;
}

export interface PackageIR {
  package_ir_version: "0.1";
  semantic_hash: string;
  hashes: PackageHashSetIR;
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
      subpath: string | null;
    };
    schemas: string[];
    evals: string[];
    examples: string[];
    no_evals: boolean;
    runtime: PackageRuntimeManifest | null;
    hosted: HostedRuntimeMetadata | null;
  };
  files: PackageIRFile[];
  resources: PackageResourceIR[];
  dependencies: ProseIR["package"]["dependencies"];
  policy: PackagePolicyIR;
  meta: PackageMetaIR;
  components: ComponentIR[];
  graph: GraphIR;
  diagnostics: Diagnostic[];
}

export interface LocalStoreLayout {
  store_version: "0.1";
  root: string;
  runs_dir: string;
  artifacts_dir: string;
  graphs_dir: string;
  indexes_dir: string;
  meta_dir: string;
  metadata_path: string;
}

export interface LocalStoreMetadata {
  store_version: "0.1";
  created_at: string;
  updated_at: string;
  layout: {
    runs: "runs";
    artifacts: "artifacts";
    graphs: "graphs";
    indexes: "indexes";
    meta: "meta";
  };
  migrations: string[];
}

export interface LocalStoreRunIndexEntry {
  run_id: string;
  kind: "component" | "graph";
  component_ref: string;
  status: RunLifecycleStatus;
  acceptance: RunAcceptanceStatus;
  created_at: string;
  completed_at: string | null;
  record_ref: string;
}

export interface LocalArtifactSchemaStatus {
  status: "unchecked" | "valid" | "invalid";
  schema_ref: string | null;
  diagnostics: Diagnostic[];
}

export interface LocalArtifactProvenance {
  run_id: string;
  node_id: string | null;
  port: string | null;
  direction: "input" | "output" | "runtime" | "diagnostic" | "artifact";
  source_run_id: string | null;
}

export interface LocalArtifactStorage {
  provider: "local";
  path: string;
}

export interface LocalArtifactRecord {
  artifact_record_version: "0.1";
  artifact_id: string;
  content_hash: string;
  content_type: string;
  size_bytes: number;
  schema: LocalArtifactSchemaStatus;
  policy_labels: string[];
  provenance: LocalArtifactProvenance;
  storage: LocalArtifactStorage;
  created_at: string;
}

export interface LocalGraphNodePointer {
  pointer_version: "0.1";
  graph_id: string;
  node_id: string;
  component_ref: string;
  current_run_id: string | null;
  latest_run_id: string | null;
  failed_run_id: string | null;
  pending_run_id: string | null;
  updated_at: string;
}

export interface LocalRunAttemptFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface LocalRunAttemptRetry {
  max_attempts: number;
  next_attempt_after: string | null;
  reason: string | null;
}

export interface LocalRunResumePoint {
  checkpoint_ref: string;
  reason: string | null;
}

export interface LocalRunAttemptRecord {
  attempt_record_version: "0.1";
  attempt_id: string;
  run_id: string;
  component_ref: string;
  attempt_number: number;
  status: RunLifecycleStatus;
  runtime_profile: RuntimeProfile | null;
  node_session_ref: string | null;
  started_at: string;
  finished_at: string | null;
  diagnostics: Diagnostic[];
  failure: LocalRunAttemptFailure | null;
  retry: LocalRunAttemptRetry | null;
  resume: LocalRunResumePoint | null;
}

export type RunLifecycleStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "blocked";

export type RunAcceptanceStatus = "accepted" | "rejected" | "pending" | "not_required";

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
  eval_run_id?: string;
  score?: number | null;
}

export interface LocalEvalResultRecord {
  eval_record_version: "0.1";
  eval_id: string;
  eval_ref: string;
  subject_run_id: string;
  eval_run_id: string;
  required: boolean;
  status: RunEvalRecord["status"];
  score: number | null;
  verdict: string | null;
  output_refs: RunOutputRecord[];
  diagnostics: Diagnostic[];
  created_at: string;
}

export interface RunPolicyDeclassificationRecord {
  from_labels: string[];
  to_labels: string[];
  component_ref: string;
  authorized_by: "approved_effect" | "hosted_policy";
}

export interface RunPolicyBudgetRecord {
  effect: string;
  limit: number | null;
  unit: string | null;
  status: "declared" | "not_declared";
}

export interface RunPolicyIdempotencyRecord {
  effect: string;
  key: string | null;
  status: "declared" | "missing" | "not_required";
}

export interface RunPolicyRecord {
  labels: string[];
  input_labels: Record<string, string[]>;
  output_labels: Record<string, string[]>;
  declassifications: RunPolicyDeclassificationRecord[];
  budgets: RunPolicyBudgetRecord[];
  idempotency_keys: RunPolicyIdempotencyRecord[];
  performed_effects: string[];
  diagnostics: Diagnostic[];
}

export interface RuntimeProfile {
  profile_version: "0.1";
  graph_vm: string;
  single_run_harness: string | null;
  model_provider: string | null;
  model: string | null;
  thinking: string | null;
  tools: string[];
  persist_sessions: boolean;
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
    graph_vm: string;
    single_run_harness: string | null;
    model_provider: string | null;
    model: string | null;
    thinking: string | null;
    tools: string[];
    persist_sessions: boolean;
    profile: RuntimeProfile;
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
  policy?: RunPolicyRecord;
  acceptance: {
    status: RunAcceptanceStatus;
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

export type RemoteArtifactKind =
  | "runtime_ir"
  | "runtime_trace"
  | "runtime_plan"
  | "runtime_manifest"
  | "runtime_run_record"
  | "runtime_node_run_record"
  | "runtime_stdout"
  | "runtime_stderr"
  | "input_binding"
  | "output_binding"
  | "diagnostic"
  | "artifact";

export type RemoteArtifactParsePolicy =
  | "must_parse_json"
  | "preserve_text"
  | "preserve_bytes"
  | "declared_content";

export interface RemoteArtifactBinding {
  direction: "input" | "output";
  component_ref: string | null;
  port: string;
  binding_path: string;
}

export interface RemoteArtifactManifestEntry {
  path: string;
  kind: RemoteArtifactKind;
  content_type: string;
  parse_policy: RemoteArtifactParsePolicy;
  sha256: string;
  size_bytes: number;
  binding: RemoteArtifactBinding | null;
  policy_labels: string[];
  warnings: string[];
}

export interface RemoteArtifactManifest {
  artifact_manifest_version: "0.1";
  run_id: string;
  generated_at: string;
  artifacts: RemoteArtifactManifestEntry[];
  diagnostics: Diagnostic[];
}

export interface RemoteExecutionEnvelope {
  schema_version: "0.2";
  run_id: string;
  run_dir: string;
  component_ref: string;
  status: RunLifecycleStatus;
  graph_vm: string;
  runtime_profile: RuntimeProfile;
  plan_status: ExecutionPlan["status"];
  acceptance: RunRecord["acceptance"];
  trigger: RunRecord["caller"]["trigger"];
  inputs: RunBindingRecord[];
  outputs: RunOutputRecord[];
  effect_declarations: string[];
  approved_effects: string[];
  package_metadata_path: string | null;
  artifact_manifest: RemoteArtifactManifest;
  artifact_manifest_path: string;
  run_record_path: string;
  plan_path: string;
  trace_path: string;
  ir_path: string;
  stdout_path: string;
  stderr_path: string;
  started_at: string;
  finished_at: string;
  exit_code: number;
  error: {
    message: string;
    code: string;
  } | null;
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
  approved_effects: string[];
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
  acceptance_reason: string | null;
  outputs: string[];
  effects: string[];
}

export interface TraceAttemptView {
  attempt_id: string;
  attempt_number: number;
  status: RunLifecycleStatus;
  runtime_profile: RuntimeProfile | null;
  node_session_ref: string | null;
  diagnostic_codes: string[];
  failure: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface TraceArtifactView {
  artifact_id: string;
  direction: LocalArtifactProvenance["direction"];
  port: string | null;
  node_id: string | null;
  content_hash: string;
  content_type: string;
  schema_status: LocalArtifactSchemaStatus["status"];
  policy_labels: string[];
  storage_path: string;
}

export interface TraceView {
  trace_version: "0.1";
  run_id: string;
  component_ref: string;
  kind: RunRecord["kind"];
  status: RunLifecycleStatus;
  acceptance: RunRecord["acceptance"]["status"];
  acceptance_reason: string | null;
  runtime: RunRecord["runtime"];
  created_at: string;
  completed_at: string | null;
  inputs: string[];
  outputs: string[];
  dependencies: string[];
  nodes: TraceNodeView[];
  attempts: TraceAttemptView[];
  artifacts: TraceArtifactView[];
  events: TraceEvent[];
}

export interface RunStatusEntry {
  run_id: string;
  component_ref: string;
  kind: RunRecord["kind"];
  status: RunLifecycleStatus;
  acceptance: RunRecord["acceptance"]["status"];
  acceptance_reason: string | null;
  created_at: string;
  completed_at: string | null;
  outputs: string[];
  node_count: number;
  attempt_count: number;
  latest_attempt_status: RunLifecycleStatus | null;
  run_dir: string;
}

export interface RunStatusView {
  status_version: "0.1";
  root: string;
  total: number;
  runs: RunStatusEntry[];
}

export interface PreflightEnvironmentCheck {
  name: string;
  status: "set" | "missing";
  declared_by: string[];
}

export interface PreflightDependencyCheck {
  package: string;
  sha: string;
  pinned: boolean;
  installed: boolean;
  install_dir: string | null;
  lockfile_path: string | null;
  refs: string[];
}

export interface PreflightResult {
  preflight_version: "0.1";
  target: string;
  package_root: string;
  component_refs: string[];
  status: "pass" | "fail";
  environment: PreflightEnvironmentCheck[];
  dependencies: PreflightDependencyCheck[];
  diagnostics: Diagnostic[];
  missing: string[];
  warnings: string[];
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

export interface PackagePortMetadata {
  name: string;
  type: string;
  required: boolean;
  policy_labels: string[];
}

export interface PackageArtifactContractMetadata {
  port: string;
  type: string;
  required: boolean;
  default_path: string;
  content_type: string;
  policy_labels: string[];
}

export interface PackageComponentRuntimeMetadata {
  graph_vm: string | null;
  model_providers: string[];
  effects: string[];
  environment: Array<{ name: string; required: boolean }>;
}

export interface PackageComponentMetadata {
  name: string;
  kind: ComponentKind;
  path: string;
  registry_ref: string | null;
  summary: string | null;
  inputs: PackagePortMetadata[];
  outputs: PackagePortMetadata[];
  artifact_contract: PackageArtifactContractMetadata[];
  runtime: PackageComponentRuntimeMetadata;
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
  schema_version: "openprose.package.v2";
  package_version: "0.2";
  metadata_digest: string;
  root: string;
  package_ir: {
    version: PackageIR["package_ir_version"];
    semantic_hash: string;
    hashes: PackageHashSetIR;
  };
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
      subpath: string | null;
    };
    dependencies: ProseIR["package"]["dependencies"];
    schemas: string[];
    evals: string[];
    examples: string[];
    no_evals: boolean;
    runtime: PackageRuntimeManifest | null;
    hosted: HostedRuntimeMetadata | null;
  };
  components: PackageComponentMetadata[];
  diagnostics: Diagnostic[];
  quality: PackageQualitySummary;
  runtime: PackageRuntimeManifest & {
    required_effects: string[];
    environment: Array<{ name: string; required: boolean }>;
  };
  hosted_ingest: {
    contract_version: "0.2";
    package: {
      name: string;
      version: string | null;
      catalog: string;
      registry_ref: string | null;
      description: string | null;
      license: string | null;
    };
    source: PackageMetadata["manifest"]["source"];
    package_ir: PackageMetadata["package_ir"];
    runtime: PackageMetadata["runtime"];
    components: PackageComponentMetadata[];
    quality: PackageQualitySummary;
  };
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

export interface WorkspaceInstallResult {
  install_version: "0.1";
  workspace_root: string;
  deps_root: string;
  lockfile_path: string;
  installed_packages: Array<{
    package: string;
    sha: string;
    install_dir: string;
  }>;
}
