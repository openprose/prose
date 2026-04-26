import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileSource } from "./compiler.js";
import type { ComponentIR, ProseIR } from "./types.js";

export interface SingleRunHandoffOptions {
  inputs?: Record<string, string>;
}

export interface SingleRunHandoff {
  handoff_version: "0.1";
  source_path: string;
  package: {
    name: string;
    source_sha: string;
    ir_hash: string;
  };
  boundary: {
    mode: "single_run_harness";
    graph_vm: null;
    note: string;
  };
  component: {
    id: string;
    name: string;
    kind: ComponentIR["kind"];
    summary: string;
    requires: HandoffPort[];
    ensures: HandoffPort[];
    effects: HandoffEffect[];
    environment: HandoffEnvironment[];
    execution: string | null;
  };
  inputs: HandoffInput[];
  missing_required_inputs: string[];
  output_contract: {
    output_tool: "openprose_submit_outputs";
    accepted_response: "output_submission_payload";
    outputs: HandoffOutput[];
  };
}

export interface HandoffPort {
  name: string;
  type: string;
  required: boolean;
  description: string;
  policy_labels: string[];
}

export interface HandoffInput extends HandoffPort {
  value: string | null;
}

export interface HandoffOutput extends HandoffPort {
  content: null;
}

export interface HandoffEffect {
  kind: string;
  description: string;
  config: Record<string, string | number | boolean>;
}

export interface HandoffEnvironment {
  name: string;
  required: boolean;
}

export async function handoffFile(
  path: string,
  options: SingleRunHandoffOptions = {},
): Promise<SingleRunHandoff> {
  const resolved = resolve(path);
  const source = await readFile(resolved, "utf8");
  return handoffSource(source, { ...options, path });
}

export function handoffSource(
  source: string,
  options: SingleRunHandoffOptions & { path: string },
): SingleRunHandoff {
  const ir = compileSource(source, { path: options.path });
  const component = singleExecutableComponent(ir);
  const inputs = component.ports.requires.map((port) => ({
    ...portProjection(port),
    value: options.inputs?.[port.name] ?? null,
  }));

  return {
    handoff_version: "0.1",
    source_path: normalizePath(options.path),
    package: {
      name: ir.package.name,
      source_sha: ir.package.source_sha,
      ir_hash: ir.semantic_hash,
    },
    boundary: {
      mode: "single_run_harness",
      graph_vm: null,
      note:
        "This handoff is for one compatible harness session. Reactive multi-node graphs run through the OpenProse Pi graph VM.",
    },
    component: {
      id: component.id,
      name: component.name,
      kind: component.kind,
      summary: summarizeComponent(component),
      requires: component.ports.requires.map(portProjection),
      ensures: component.ports.ensures.map(portProjection),
      effects: component.effects.map((effect) => ({
        kind: effect.kind,
        description: effect.description,
        config: effect.config,
      })),
      environment: component.environment.map((binding) => ({
        name: binding.name,
        required: binding.required,
      })),
      execution: component.execution?.body ?? null,
    },
    inputs,
    missing_required_inputs: inputs
      .filter((input) => input.required && input.value === null)
      .map((input) => input.name),
    output_contract: {
      output_tool: "openprose_submit_outputs",
      accepted_response: "output_submission_payload",
      outputs: component.ports.ensures.map((port) => ({
        ...portProjection(port),
        content: null,
      })),
    },
  };
}

export function renderSingleRunHandoffMarkdown(handoff: SingleRunHandoff): string {
  const lines: string[] = [];
  lines.push("# OpenProse Single-Run Handoff");
  lines.push("");
  lines.push(handoff.boundary.note);
  lines.push("");
  lines.push("## Component");
  lines.push("");
  lines.push(`- name: ${handoff.component.name}`);
  lines.push(`- kind: ${handoff.component.kind}`);
  lines.push(`- package: ${handoff.package.name}`);
  lines.push(`- source_sha: ${handoff.package.source_sha}`);
  lines.push("");
  lines.push("## Inputs");
  lines.push("");
  pushPortLines(lines, handoff.inputs, true);
  lines.push("");
  lines.push("## Outputs");
  lines.push("");
  pushPortLines(lines, handoff.output_contract.outputs, false);
  lines.push("");
  lines.push("## Effects");
  lines.push("");
  if (handoff.component.effects.length === 0) {
    lines.push("- (none declared)");
  } else {
    for (const effect of handoff.component.effects) {
      lines.push(`- ${effect.kind}: ${effect.description || "(declared effect)"}`);
    }
  }
  if (handoff.component.environment.length > 0) {
    lines.push("");
    lines.push("## Environment");
    lines.push("");
    for (const binding of handoff.component.environment) {
      lines.push(`- ${binding.name}${binding.required ? " (required)" : " (optional)"}`);
    }
  }
  if (handoff.component.execution) {
    lines.push("");
    lines.push("## Execution");
    lines.push("");
    lines.push(handoff.component.execution.trim());
  }
  lines.push("");
  lines.push("## Return Contract");
  lines.push("");
  lines.push(
    "Return an OpenProse output submission payload. If the harness exposes `openprose_submit_outputs`, call it with this shape; otherwise return the same JSON payload to the caller.",
  );
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(exampleSubmission(handoff), null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Full Handoff");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(handoff, null, 2));
  lines.push("```");
  return `${lines.join("\n")}\n`;
}

function singleExecutableComponent(ir: ProseIR): ComponentIR {
  const main = ir.components.find((component) => component.kind === "program") ?? null;
  const executable =
    main && ir.components.length > 1
      ? ir.components.filter((component) => component.id !== main.id)
      : ir.components;

  if (executable.length !== 1) {
    throw new Error(
      `Single-run handoff requires exactly one executable component; this source has ${executable.length}. ` +
        "Use 'prose run --graph-vm pi' for reactive graphs.",
    );
  }
  return executable[0];
}

function portProjection(port: ComponentIR["ports"]["requires"][number]): HandoffPort {
  return {
    name: port.name,
    type: port.type,
    required: port.required,
    description: port.description,
    policy_labels: [...port.policy_labels],
  };
}

function pushPortLines(
  lines: string[],
  ports: Array<HandoffInput | HandoffOutput>,
  includeValue: boolean,
): void {
  if (ports.length === 0) {
    lines.push("- (none)");
    return;
  }
  for (const port of ports) {
    const required = port.required ? "required" : "optional";
    const labels =
      port.policy_labels.length > 0 ? ` labels[${port.policy_labels.join(", ")}]` : "";
    const value =
      includeValue && "value" in port
        ? ` value=${port.value === null ? "(missing)" : JSON.stringify(port.value)}`
        : "";
    lines.push(`- ${port.name} (${port.type}, ${required})${labels}${value}`);
  }
}

function exampleSubmission(handoff: SingleRunHandoff) {
  return {
    outputs: handoff.output_contract.outputs.map((output) => ({
      port: output.name,
      content: `<${output.type} content>`,
    })),
    performed_effects: handoff.component.effects.map((effect) => effect.kind),
  };
}

function summarizeComponent(component: ComponentIR): string {
  const outputNames = component.ports.ensures.map((port) => port.name).join(", ");
  return outputNames
    ? `${component.name} produces ${outputNames}.`
    : `${component.name} has no declared outputs.`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
