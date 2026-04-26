import { evaluateRuntimePolicy } from "../policy/index.js";
import type {
  ProviderKind,
  ProviderRequest,
} from "../providers/index.js";
import { providerInputState } from "./bindings.js";
import type { ComponentIR, ProseIR, RunRecord } from "../types.js";

export interface RuntimeProviderRequestContext {
  ir: ProseIR;
  provider: { kind: ProviderKind };
  runDir: string;
  storeRoot: string;
  runId: string;
  inputs: Record<string, string>;
  approvedEffects: string[];
}

export async function createProviderRequest(
  ctx: RuntimeProviderRequestContext,
  component: ComponentIR,
  runId = ctx.runId,
  recordsById = new Map<string, RunRecord>(),
): Promise<ProviderRequest> {
  const inputState = await providerInputState(ctx, component, recordsById);
  const policy = evaluateRuntimePolicy({
    component,
    inputBindings: inputState.bindings,
    approvedEffects: ctx.approvedEffects,
  });
  return {
    provider_request_version: "0.1",
    request_id: runId,
    provider: ctx.provider.kind,
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
