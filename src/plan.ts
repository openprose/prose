import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { compileSource } from "./compiler";
import { sha256 } from "./hash";
import type {
  ComponentIR,
  ExecutionPlan,
  GraphEdgeIR,
  PlanNode,
  RunRecord,
} from "./types";

export interface CurrentRunSet {
  graph: RunRecord | null;
  nodes: RunRecord[];
}

export interface PlanOptions {
  path: string;
  inputs?: Record<string, string>;
  currentRun?: CurrentRunSet;
  currentRunPath?: string;
}

export async function planFile(
  path: string,
  options: Omit<PlanOptions, "path"> = {},
): Promise<ExecutionPlan> {
  const source = await readFile(resolve(path), "utf8");
  const currentRun = options.currentRunPath
    ? await loadCurrentRunSet(options.currentRunPath)
    : options.currentRun;
  return planSource(source, { ...options, currentRun, path });
}

export function planSource(source: string, options: PlanOptions): ExecutionPlan {
  const ir = compileSource(source, { path: options.path });
  const main = ir.components.find((component) => component.kind === "program");
  const executable =
    main && ir.components.length > 1
      ? ir.components.filter((component) => component.id !== main.id)
      : ir.components;
  const inputs = options.inputs ?? {};
  const currentRun = options.currentRun ?? { graph: null, nodes: [] };
  const currentByComponent = new Map(
    currentRun.nodes.map((record) => [record.component_ref, record]),
  );
  const planNodes: PlanNode[] = [];

  for (const component of topologicalOrder(executable, ir.graph.edges)) {
    const dependsOn = dependenciesFor(component.id, ir.graph.edges);
    const currentRecord = currentByComponent.get(component.name) ?? null;
    const staleReasons = staleReasonsForComponent(
      component,
      currentRecord,
      ir.package.source_sha,
      ir.semantic_hash,
      ir.graph.edges,
      inputs,
      currentByComponent,
      planNodes,
    );
    const missingInputs = component.ports.requires
      .filter((port) => !hasResolvableInput(component, port.name, ir.graph.edges, inputs))
      .map((port) => `Missing required input '${port.name}'.`);
    const upstreamBlocked = dependsOn
      .map((dependency) => planNodes.find((node) => node.node_id === dependency))
      .filter((node): node is PlanNode => Boolean(node))
      .filter(
        (node) =>
          node.status === "blocked_input" || node.status === "blocked_effect",
      )
      .map((node) => `Upstream node '${node.component_ref}' is ${node.status}.`);
    const unsafeEffects = staleReasons.length > 0
      ? unsafeEffectKinds(component).map(
          (effect) => `Effect '${effect}' requires a gate before execution.`,
        )
      : [];
    const blockedReasons = [...missingInputs, ...upstreamBlocked, ...unsafeEffects];
    const status = nodeStatus(staleReasons, blockedReasons, unsafeEffects);

    planNodes.push({
      node_id: component.id,
      component_ref: component.name,
      status,
      stale_reasons: staleReasons,
      blocked_reasons: blockedReasons,
      depends_on: dependsOn,
      effects: component.effects.map((effect) => effect.kind),
      current_run_id: currentRecord?.run_id ?? null,
    });
  }

  const graphStaleReasons = main
    ? staleReasonsForGraph(
        main,
        currentRun.graph,
        ir.package.source_sha,
        ir.semantic_hash,
        inputs,
      )
    : [];
  const graphBlockedReasons = main && graphStaleReasons.length > 0
    ? unsafeEffectKinds(main).map(
        (effect) => `Graph effect '${effect}' requires a gate before execution.`,
      )
    : [];

  return {
    plan_version: "0.1",
    component_ref: main?.name ?? ir.components[0]?.name ?? ir.package.name,
    ir_hash: ir.semantic_hash,
    status: planStatus(planNodes, graphStaleReasons, graphBlockedReasons, Boolean(main)),
    graph_stale_reasons: graphStaleReasons,
    graph_blocked_reasons: graphBlockedReasons,
    nodes: planNodes,
    diagnostics: ir.diagnostics,
  };
}

function nodeStatus(
  staleReasons: string[],
  blockedReasons: string[],
  unsafeEffects: string[],
): PlanNode["status"] {
  if (staleReasons.length === 0 && blockedReasons.length === 0) {
    return "current";
  }
  if (unsafeEffects.length > 0) {
    return "blocked_effect";
  }
  if (blockedReasons.length > 0) {
    return "blocked_input";
  }
  return "ready";
}

function planStatus(
  nodes: PlanNode[],
  graphStaleReasons: string[],
  graphBlockedReasons: string[],
  hasGraphRecord: boolean,
): ExecutionPlan["status"] {
  if (
    graphBlockedReasons.length > 0 ||
    nodes.some(
      (node) => node.status === "blocked_input" || node.status === "blocked_effect",
    )
  ) {
    return "blocked";
  }
  if (
    nodes.length > 0 &&
    nodes.every((node) => node.status === "current") &&
    (!hasGraphRecord || graphStaleReasons.length === 0)
  ) {
    return "current";
  }
  return "ready";
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

function topologicalOrder(
  components: ComponentIR[],
  edges: GraphEdgeIR[],
): ComponentIR[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const sourceOrder = new Map(
    components.map((component, index) => [component.id, index]),
  );
  const remaining = new Set(components.map((component) => component.id));
  const ordered: ComponentIR[] = [];

  while (remaining.size > 0) {
    const ready = Array.from(remaining)
      .filter((id) =>
        dependenciesFor(id, edges).every((dependency) => !remaining.has(dependency)),
      )
      .sort((a, b) => (sourceOrder.get(a) ?? 0) - (sourceOrder.get(b) ?? 0));

    if (ready.length === 0) {
      return components;
    }

    for (const id of ready) {
      const component = byId.get(id);
      if (component) {
        ordered.push(component);
      }
      remaining.delete(id);
    }
  }

  return ordered;
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

function staleReasonsForComponent(
  component: ComponentIR,
  currentRecord: RunRecord | null,
  sourceSha: string,
  irHash: string,
  edges: GraphEdgeIR[],
  inputs: Record<string, string>,
  currentByComponent: Map<string, RunRecord>,
  planNodes: PlanNode[],
): string[] {
  if (!currentRecord) {
    return ["no_current_run"];
  }

  const reasons = staleReasonsForRunRecord(currentRecord, sourceSha, irHash);
  const declaredEffects = component.effects.map((effect) => effect.kind).sort();
  const recordEffects = [...currentRecord.effects.declared].sort();
  if (declaredEffects.join("\n") !== recordEffects.join("\n")) {
    reasons.push("effects_changed");
  }

  for (const port of component.ports.requires) {
    const expectedHash = expectedInputHash(
      component,
      port.name,
      edges,
      inputs,
      currentByComponent,
    );
    const recordInput = currentRecord.inputs.find((input) => input.port === port.name);
    if (expectedHash && recordInput && recordInput.value_hash !== expectedHash) {
      reasons.push(`input_hash_changed:${port.name}`);
    }
  }

  for (const port of component.ports.ensures) {
    if (!currentRecord.outputs.some((output) => output.port === port.name)) {
      reasons.push(`output_missing:${port.name}`);
    }
  }

  for (const dependency of dependenciesFor(component.id, edges)) {
    const upstream = planNodes.find((node) => node.node_id === dependency);
    if (upstream && upstream.status !== "current") {
      reasons.push(`upstream_stale:${upstream.component_ref}`);
    }
  }

  return reasons;
}

function staleReasonsForGraph(
  main: ComponentIR,
  currentRecord: RunRecord | null,
  sourceSha: string,
  irHash: string,
  inputs: Record<string, string>,
): string[] {
  if (!currentRecord) {
    return ["no_current_run"];
  }

  const reasons = staleReasonsForRunRecord(currentRecord, sourceSha, irHash);
  for (const port of main.ports.requires) {
    const value = inputs[port.name];
    const recordInput = currentRecord.inputs.find((input) => input.port === port.name);
    if (value !== undefined && recordInput && recordInput.value_hash !== sha256(value)) {
      reasons.push(`input_hash_changed:${port.name}`);
    }
  }
  for (const port of main.ports.ensures) {
    if (!currentRecord.outputs.some((output) => output.port === port.name)) {
      reasons.push(`output_missing:${port.name}`);
    }
  }
  return reasons;
}

function staleReasonsForRunRecord(
  record: RunRecord,
  sourceSha: string,
  irHash: string,
): string[] {
  const reasons: string[] = [];
  if (record.status !== "succeeded") {
    reasons.push(`run_status:${record.status}`);
  }
  if (
    record.acceptance.status !== "accepted" &&
    record.acceptance.status !== "not_required"
  ) {
    reasons.push(`acceptance:${record.acceptance.status}`);
  }
  if (record.component_version.source_sha !== sourceSha) {
    reasons.push("source_sha_changed");
  }
  if (record.component_version.ir_hash !== irHash) {
    reasons.push("ir_hash_changed");
  }
  return reasons;
}

function expectedInputHash(
  component: ComponentIR,
  portName: string,
  edges: GraphEdgeIR[],
  inputs: Record<string, string>,
  currentByComponent: Map<string, RunRecord>,
): string | null {
  if (inputs[portName] !== undefined) {
    return sha256(inputs[portName]);
  }

  const edge = edges.find(
    (candidate) =>
      candidate.to.component === component.id && candidate.to.port === portName,
  );
  if (!edge || edge.from.component === "$caller") {
    return null;
  }

  const provider = currentByComponent.get(edge.from.component);
  const output = provider?.outputs.find(
    (candidate) => candidate.port === edge.from.port,
  );
  return output?.value_hash ?? null;
}

function unsafeEffectKinds(component: ComponentIR): string[] {
  const kinds = component.effects.map((effect) => effect.kind);
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === "pure")) {
    return [];
  }
  return kinds.filter((kind) => kind !== "pure");
}

async function loadCurrentRunSet(path: string): Promise<CurrentRunSet> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    const record = JSON.parse(await readFile(resolved, "utf8")) as RunRecord;
    return record.kind === "graph"
      ? { graph: record, nodes: [] }
      : { graph: null, nodes: [record] };
  }

  const primary = JSON.parse(
    await readFile(resolve(resolved, "run.json"), "utf8"),
  ) as RunRecord;
  const nodes: RunRecord[] = primary.kind === "component" ? [primary] : [];

  try {
    const nodeFiles = (await readdir(resolve(resolved, "nodes")))
      .filter((file) => file.endsWith(".run.json"))
      .sort();
    for (const file of nodeFiles) {
      const node = JSON.parse(
        await readFile(resolve(resolved, "nodes", file), "utf8"),
      ) as RunRecord;
      if (!nodes.some((record) => record.run_id === node.run_id)) {
        nodes.push(node);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return {
    graph: primary.kind === "graph" ? primary : null,
    nodes,
  };
}
