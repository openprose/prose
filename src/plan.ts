import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileSource } from "./compiler";
import type { ComponentIR, ExecutionPlan, GraphEdgeIR, PlanNode } from "./types";

export interface PlanOptions {
  path: string;
  inputs?: Record<string, string>;
}

export async function planFile(
  path: string,
  options: Omit<PlanOptions, "path"> = {},
): Promise<ExecutionPlan> {
  const source = await readFile(resolve(path), "utf8");
  return planSource(source, { ...options, path });
}

export function planSource(source: string, options: PlanOptions): ExecutionPlan {
  const ir = compileSource(source, { path: options.path });
  const main = ir.components.find((component) => component.kind === "program");
  const executable =
    main && ir.components.length > 1
      ? ir.components.filter((component) => component.id !== main.id)
      : ir.components;
  const inputs = options.inputs ?? {};
  const planNodes: PlanNode[] = [];

  for (const component of executable) {
    const dependsOn = dependenciesFor(component.id, ir.graph.edges);
    const missingInputs = component.ports.requires
      .filter((port) => !hasResolvableInput(component, port.name, ir.graph.edges, inputs))
      .map((port) => `Missing required input '${port.name}'.`);
    const upstreamBlocked = dependsOn
      .map((dependency) => planNodes.find((node) => node.node_id === dependency))
      .filter((node): node is PlanNode => Boolean(node))
      .filter((node) => node.status !== "ready")
      .map((node) => `Upstream node '${node.component_ref}' is ${node.status}.`);
    const unsafeEffects = unsafeEffectKinds(component).map(
      (effect) => `Effect '${effect}' requires a gate before execution.`,
    );
    const blockedReasons = [...missingInputs, ...upstreamBlocked, ...unsafeEffects];
    const status: PlanNode["status"] =
      unsafeEffects.length > 0
        ? "blocked_effect"
        : blockedReasons.length > 0
          ? "blocked_input"
          : "ready";

    planNodes.push({
      node_id: component.id,
      component_ref: component.name,
      status,
      stale_reasons: ["no_current_run"],
      blocked_reasons: blockedReasons,
      depends_on: dependsOn,
      effects: component.effects.map((effect) => effect.kind),
    });
  }

  const graphBlockedReasons = main
    ? unsafeEffectKinds(main).map(
        (effect) => `Graph effect '${effect}' requires a gate before execution.`,
      )
    : [];
  const status =
    graphBlockedReasons.length > 0 ||
    planNodes.some((node) => node.status !== "ready")
      ? "blocked"
      : "ready";

  return {
    plan_version: "0.1",
    component_ref: main?.name ?? ir.components[0]?.name ?? ir.package.name,
    ir_hash: ir.semantic_hash,
    status,
    graph_blocked_reasons: graphBlockedReasons,
    nodes: planNodes,
    diagnostics: ir.diagnostics,
  };
}

function hasResolvableInput(
  component: ComponentIR,
  portName: string,
  edges: GraphEdgeIR[],
  inputs: Record<string, string>,
): boolean {
  if (inputs[portName] !== undefined) {
    return true;
  }

  const edge = edges.find(
    (candidate) =>
      candidate.to.component === component.id && candidate.to.port === portName,
  );
  return Boolean(edge && edge.from.component !== "$caller");
}

function dependenciesFor(componentId: string, edges: GraphEdgeIR[]): string[] {
  return Array.from(
    new Set(
      edges
        .filter(
          (edge) =>
            edge.to.component === componentId &&
            edge.from.component !== "$caller" &&
            edge.from.component !== "$return",
        )
        .map((edge) => edge.from.component),
    ),
  ).sort();
}

function unsafeEffectKinds(component: ComponentIR): string[] {
  const kinds = component.effects.map((effect) => effect.kind);
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === "pure")) {
    return [];
  }
  return kinds.filter((kind) => kind !== "pure");
}

