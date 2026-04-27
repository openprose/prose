import { evaluateRuntimePolicy } from "../policy/index.js";
import { runtimeProfileForComponentRuntime } from "./profiles.js";
import type {
  GraphVmKind,
  NodeRunRequest,
} from "../node-runners/index.js";
import { nodeInputState } from "./bindings.js";
import type { ComponentIR, ProseIR, RunRecord, RuntimeProfile } from "../types.js";

export interface NodeRunnerRequestContext {
  ir: ProseIR;
  nodeRunner: { kind: GraphVmKind };
  runtimeProfile: RuntimeProfile;
  runDir: string;
  storeRoot: string;
  runId: string;
  inputs: Record<string, string>;
  approvedEffects: string[];
}

export async function createNodeRunRequest(
  ctx: NodeRunnerRequestContext,
  component: ComponentIR,
  runId = ctx.runId,
  recordsById = new Map<string, RunRecord>(),
): Promise<NodeRunRequest> {
  const inputState = await nodeInputState(ctx, component, recordsById);
  const runtimeProfile = runtimeProfileForComponentRuntime(
    ctx.runtimeProfile,
    component.runtime,
  );
  const policy = evaluateRuntimePolicy({
    component,
    inputBindings: inputState.bindings,
    approvedEffects: ctx.approvedEffects,
  });
  return {
    node_run_request_version: "0.1",
    request_id: runId,
    graph_vm: ctx.nodeRunner.kind,
    runtime_profile: runtimeProfile,
    component,
    rendered_contract: renderComponentContract(ctx.ir, component),
    input_bindings: inputState.bindings,
    upstream_artifacts: inputState.upstreamArtifacts,
    workspace_path: ctx.runDir,
    environment: component.environment.map((binding) => ({
      name: binding.name,
      required: binding.required,
      value: Bun.env[binding.name] ?? null,
    })),
    approved_effects: ctx.approvedEffects,
    policy_labels: policy.labels,
    expected_outputs: component.ports.ensures.map((port) => ({
      port: port.name,
      type: port.type,
      required: port.required,
      policy_labels: policy.output_labels[port.name] ?? port.policy_labels,
    })),
    validation: component.ports.ensures.map((port) => ({
      kind: "output",
      ref: port.name,
      required: port.required,
    })),
  };
}

function renderComponentContract(ir: ProseIR, component: ComponentIR): string {
  const sections = [
    `# ${component.name}`,
    `Package: ${ir.package.name}`,
    "",
    "## Requires",
    ...component.ports.requires.map((port) => `- ${port.name}: ${port.type}`),
    "",
    "## Ensures",
    ...component.ports.ensures.map((port) => `- ${port.name}: ${port.type}`),
  ];

  if (component.execution) {
    sections.push("", "## Execution", component.execution.body);
  }

  return sections.join("\n");
}
