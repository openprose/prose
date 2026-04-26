import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileSource } from "./compiler";
import { planSource } from "./plan";
import type {
  ComponentIR,
  ExecutionPlan,
  GraphView,
  GraphViewEdge,
  GraphViewNode,
  ProseIR,
} from "./types";

export interface GraphOptions {
  path: string;
  inputs?: Record<string, string>;
  currentRunPath?: string;
  targetOutputs?: string[];
  approvedEffects?: string[];
  format?: "mermaid" | "json";
}

export async function graphFile(
  path: string,
  options: Omit<GraphOptions, "path"> = {},
): Promise<GraphView> {
  const source = await readFile(resolve(path), "utf8");
  return graphSource(source, { ...options, path });
}

export function graphSource(source: string, options: GraphOptions): GraphView {
  const ir = compileSource(source, { path: options.path });
  const plan = planSource(source, {
    path: options.path,
    inputs: options.inputs,
    currentRunPath: options.currentRunPath,
    targetOutputs: options.targetOutputs,
    approvedEffects: options.approvedEffects,
  });
  return buildGraphView(ir, plan);
}

export function buildGraphView(ir: ProseIR, plan: ExecutionPlan): GraphView {
  const main = ir.components.find((component) => component.kind === "program");
  const planNodes = new Map(plan.nodes.map((node) => [node.component_ref, node]));
  const nodes: GraphViewNode[] = [];
  const executable =
    main && ir.components.length > 1
      ? ir.components.filter((component) => component.id !== main.id)
      : ir.components;
  const selected = new Set(plan.materialization_set.nodes);

  if (executable.some((component) => hasCallerEdge(ir, component))) {
    nodes.push(boundaryNode("$caller", "Caller"));
  }

  for (const component of executable) {
    nodes.push(componentGraphNode(component, planNodes.get(component.name), selected));
  }

  if (main?.ports.ensures.length || ir.graph.edges.some((edge) => edge.to.component === "$return")) {
    nodes.push(boundaryNode("$return", "Return"));
  }

  const edges: GraphViewEdge[] = ir.graph.edges.map((edge) => ({
    from: edge.from.component,
    to: edge.to.component,
    from_port: edge.from.port,
    to_port: edge.to.port,
    kind: edge.kind,
    reason: edge.reason,
    confidence: edge.confidence,
    source: edge.source,
  }));

  return {
    graph_version: "0.1",
    component_ref: plan.component_ref,
    requested_outputs: plan.requested_outputs,
    nodes,
    edges,
    diagnostics: plan.diagnostics,
  };
}

export function renderGraphMermaid(view: GraphView): string {
  const lines: string[] = [];
  lines.push(`%% OpenProse graph: ${view.component_ref}`);
  lines.push(
    `%% requested outputs: ${
      view.requested_outputs.length ? view.requested_outputs.join(", ") : "(none)"
    }`,
  );
  lines.push("flowchart LR");

  for (const node of view.nodes) {
    lines.push(`  ${mermaidId(node.id)}["${escapeMermaid(buildNodeLabel(node))}"]`);
  }

  for (const edge of view.edges) {
    lines.push(
      `  ${mermaidId(edge.from)} -->|${escapeMermaid(
        `${edge.from_port} -> ${edge.to_port} (${edge.kind})`,
      )}| ${mermaidId(edge.to)}`,
    );
  }

  lines.push("");
  lines.push("  classDef boundary fill:#f5f5f5,stroke:#999,color:#333;");
  lines.push("  classDef current fill:#e8fff1,stroke:#159947,color:#0f5e2b;");
  lines.push("  classDef ready fill:#fff8dd,stroke:#c98a00,color:#7a5400;");
  lines.push("  classDef blocked_input fill:#ffe9e8,stroke:#cb2d3e,color:#7f1020;");
  lines.push("  classDef blocked_effect fill:#fce4ff,stroke:#8e3ec9,color:#5b2382;");
  lines.push("  classDef skipped fill:#f0f0f0,stroke:#8a8a8a,color:#555;");

  for (const node of view.nodes) {
    lines.push(`  class ${mermaidId(node.id)} ${node.status};`);
  }

  return `${lines.join("\n")}\n`;
}

function componentGraphNode(
  component: ComponentIR,
  planNode: ExecutionPlan["nodes"][number] | undefined,
  selected: Set<string>,
): GraphViewNode {
  return {
    id: component.id,
    label: component.name,
    component_ref: component.name,
    kind: component.kind,
    source: `${component.source.path}:${component.source.span.start_line}`,
    requires: component.ports.requires.map((port) => port.name),
    ensures: component.ports.ensures.map((port) => port.name),
    effects: component.effects.map((effect) => effect.kind),
    access_labels: Object.keys(component.access.rules).sort(),
    status: planNode?.status ?? "current",
    stale_reasons: planNode?.stale_reasons ?? [],
    blocked_reasons: planNode?.blocked_reasons ?? [],
    selected: selected.has(component.name),
  };
}

function boundaryNode(id: string, label: string): GraphViewNode {
  return {
    id,
    label,
    component_ref: label,
    kind: "boundary",
    source: null,
    requires: [],
    ensures: [],
    effects: [],
    access_labels: [],
    status: "boundary",
    stale_reasons: [],
    blocked_reasons: [],
    selected: false,
  };
}

function hasCallerEdge(ir: ProseIR, component: ComponentIR): boolean {
  return ir.graph.edges.some(
    (edge) => edge.to.component === component.id && edge.from.component === "$caller",
  );
}

function buildNodeLabel(node: GraphViewNode): string {
  const lines = [
    node.label,
    `[${node.kind}]`,
  ];

  if (node.kind !== "boundary") {
    lines.push(`status: ${node.status}`);
  }
  if (node.effects.length > 0) {
    lines.push(`effects: ${node.effects.join(", ")}`);
  }
  if (node.stale_reasons.length > 0) {
    lines.push(`stale: ${node.stale_reasons.join(", ")}`);
  }
  if (node.blocked_reasons.length > 0) {
    lines.push(`blocked: ${node.blocked_reasons.join(", ")}`);
  }
  if (node.selected) {
    lines.push("selected");
  }
  if (node.source) {
    lines.push(node.source);
  }
  return lines.join("\n");
}

function mermaidId(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}

function escapeMermaid(value: string): string {
  return value.replace(/"/g, "#quot;").replace(/\n/g, "<br/>");
}
