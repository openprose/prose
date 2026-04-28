import type {
  NodeEnvironmentBinding,
  NodeExpectedOutput,
  NodeInputBinding,
  NodeValidationRule,
} from "../node-runners/index.js";
import type {
  ComponentIR,
  EffectIR,
  LocalArtifactRecord,
  PortIR,
  RuntimeProfile,
  SourceSpan,
} from "../types.js";
import type { NodeExecutionRequest } from "./node-request.js";
import {
  defaultNodePrivateStateRunRef,
  nodePrivateStateInstructions,
} from "./private-state.js";

export interface NodePromptEnvelope {
  envelope_version: "0.1";
  run: {
    run_id: string;
    graph_run_id: string;
    component_ref: string;
    workspace_path: string;
  };
  package: {
    name: string;
    source_ref: string;
    ir_hash: string;
  };
  runtime: RuntimeProfile;
  planning: {
    requested_outputs: string[];
    stale_reasons: string[];
    current_run_id: string | null;
    recompute_scope: string;
  };
  component: {
    id: string;
    name: string;
    kind: ComponentIR["kind"];
    source: SourceSpan;
    requires: NodeEnvelopePort[];
    ensures: NodeEnvelopePort[];
    effects: NodeEnvelopeEffect[];
    strategies: string | null;
    errors: NodeEnvelopeErrorSection | null;
    finally: string | null;
    catch: string | null;
    execution: string | null;
  };
  inputs: NodeEnvelopeInput[];
  upstream_artifacts: NodeEnvelopeArtifact[];
  environment: NodeEnvelopeEnvironment[];
  private_state: NodeEnvelopePrivateState;
  policy: {
    approved_effects: string[];
    policy_labels: string[];
  };
  outputs: NodeEnvelopeOutput[];
  validation: NodeValidationRule[];
  instructions: {
    output_tool: "openprose_submit_outputs";
    error_tool: "openprose_report_error";
    fallback_output_files: boolean;
    prosescript_interpreter: string[] | null;
    summary: string;
  };
}

export interface NodeEnvelopePrivateState {
  manifest_ref: string;
  subagents_root_ref: string;
  visibility: "node_private";
  retained_by_default: boolean;
  instructions: string[];
}

export interface NodeEnvelopePort {
  name: string;
  type: string;
  required: boolean;
  description: string;
  policy_labels: string[];
}

export interface NodeEnvelopeEffect {
  kind: string;
  description: string;
  config: Record<string, string | number | boolean>;
}

export interface NodeEnvelopeErrorSection {
  body: string;
  declarations: NodeEnvelopeError[];
}

export interface NodeEnvelopeError {
  code: string;
  description: string;
}

export interface NodeEnvelopeInput {
  port: string;
  value: string | null;
  source_run_id: string | null;
  artifact: NodeEnvelopeArtifact | null;
  policy_labels: string[];
}

export interface NodeEnvelopeArtifact {
  artifact_id: string;
  content_hash: string;
  content_type: string;
  size_bytes: number;
  source_run_id: string | null;
  node_id: string | null;
  port: string | null;
  policy_labels: string[];
}

export interface NodeEnvelopeEnvironment {
  name: string;
  required: boolean;
  value: "[redacted]" | null;
}

export interface NodeEnvelopeOutput {
  port: string;
  type: string;
  required: boolean;
  policy_labels: string[];
}

export function buildNodePromptEnvelope(
  request: NodeExecutionRequest,
): NodePromptEnvelope {
  const nodeRunRequest = request.node_run_request;
  return {
    envelope_version: "0.1",
    run: {
      run_id: request.run_id,
      graph_run_id: request.graph_run_id,
      component_ref: request.component_ref,
      workspace_path: ".",
    },
    package: request.package,
    runtime: request.runtime_profile,
    planning: request.planning,
    component: {
      id: request.component.id,
      name: request.component.name,
      kind: request.component.kind,
      source: request.component.source.span,
      requires: request.component.ports.requires.map(portEnvelope),
      ensures: request.component.ports.ensures.map(portEnvelope),
      effects: request.component.effects.map(effectEnvelope),
      strategies: request.component.strategies?.body ?? null,
      errors: request.component.errors
        ? {
            body: request.component.errors.body,
            declarations: request.component.errors.declarations.map((error) => ({
              code: error.code,
              description: error.description,
            })),
          }
        : null,
      finally: request.component.finally?.body ?? null,
      catch: request.component.catch?.body ?? null,
      execution: request.component.execution?.body ?? null,
    },
    inputs: nodeRunRequest.input_bindings.map(inputEnvelope),
    upstream_artifacts: nodeRunRequest.upstream_artifacts.map(artifactEnvelope),
    environment: nodeRunRequest.environment.map(environmentEnvelope),
    private_state: privateStateEnvelope(),
    policy: {
      approved_effects: nodeRunRequest.approved_effects,
      policy_labels: nodeRunRequest.policy_labels,
    },
    outputs: nodeRunRequest.expected_outputs.map(outputEnvelope),
    validation: nodeRunRequest.validation,
    instructions: {
      output_tool: "openprose_submit_outputs",
      error_tool: "openprose_report_error",
      fallback_output_files: true,
      prosescript_interpreter: request.component.execution
        ? PROSESCRIPT_INTERPRETER_GUIDELINES
        : null,
      summary:
        "Produce only declared outputs. Prefer openprose_submit_outputs when available; report declared terminal failures with openprose_report_error; include finally evidence when Finally is declared; otherwise write the requested fallback output files.",
    },
  };
}

function privateStateEnvelope(): NodeEnvelopePrivateState {
  const ref = defaultNodePrivateStateRunRef();
  return {
    manifest_ref: ref.manifest_ref,
    subagents_root_ref: ref.subagents_root_ref,
    visibility: "node_private",
    retained_by_default: true,
    instructions: nodePrivateStateInstructions(),
  };
}

const PROSESCRIPT_INTERPRETER_GUIDELINES = [
  "Treat the fenced prose execution body as semantic ProseScript instructions for this node, not as a deterministic host-compiled program.",
  "Follow calls, sessions, parallel blocks, loops, conditionals, try/catch/finally, and returns according to their ordinary workflow meaning.",
  "Treat catch blocks as intra-node recovery guidance, not as graph-level catch edges or downstream scheduling instructions.",
  "If catch recovery still satisfies the output contract, submit declared outputs; if recovery cannot satisfy it, report a declared terminal error.",
  "When openprose_subagent is available, prefer it for delegated child work that benefits from isolated context.",
  "Keep child-session work products in private workspace files and pass back concise summaries plus workspace-relative refs when possible.",
  "The parent node remains responsible for final declared output submission through openprose_submit_outputs or declared error reporting through openprose_report_error.",
];

export function renderNodePromptEnvelope(envelope: NodePromptEnvelope): string {
  return [
    "# OpenProse Node Prompt Envelope",
    "",
    "This is the complete execution envelope for one OpenProse graph node.",
    "Treat it as the durable props, policy, and output contract for this run.",
    "",
    "```json",
    JSON.stringify(envelope, null, 2),
    "```",
  ].join("\n");
}

function portEnvelope(port: PortIR): NodeEnvelopePort {
  return {
    name: port.name,
    type: port.type,
    required: port.required,
    description: port.description,
    policy_labels: port.policy_labels,
  };
}

function effectEnvelope(effect: EffectIR): NodeEnvelopeEffect {
  return {
    kind: effect.kind,
    description: effect.description,
    config: effect.config,
  };
}

function inputEnvelope(input: NodeInputBinding): NodeEnvelopeInput {
  return {
    port: input.port,
    value: input.value,
    source_run_id: input.source_run_id,
    artifact: input.artifact ? artifactEnvelope(input.artifact) : null,
    policy_labels: input.policy_labels,
  };
}

function artifactEnvelope(artifact: LocalArtifactRecord): NodeEnvelopeArtifact {
  return {
    artifact_id: artifact.artifact_id,
    content_hash: artifact.content_hash,
    content_type: artifact.content_type,
    size_bytes: artifact.size_bytes,
    source_run_id: artifact.provenance.source_run_id,
    node_id: artifact.provenance.node_id,
    port: artifact.provenance.port,
    policy_labels: artifact.policy_labels,
  };
}

function environmentEnvelope(
  binding: NodeEnvironmentBinding,
): NodeEnvelopeEnvironment {
  return {
    name: binding.name,
    required: binding.required,
    value: binding.value === null ? null : "[redacted]",
  };
}

function outputEnvelope(output: NodeExpectedOutput): NodeEnvelopeOutput {
  return {
    port: output.port,
    type: output.type,
    required: output.required,
    policy_labels: output.policy_labels,
  };
}
