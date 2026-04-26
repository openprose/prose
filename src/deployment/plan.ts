import type {
  ComponentIR,
  Diagnostic,
  ExecutionPlan,
  GraphEdgeIR,
  GraphView,
  GraphViewEdge,
  GraphViewNode,
  PackageIR,
  PlanNode,
  PortIR,
  ProseIR,
  RunRecord,
} from "../types.js";
import { loadCurrentRunSet, type CurrentRunSet } from "../plan.js";

export interface PackageEntrypointPlanOptions {
  entrypoint: string;
  inputs?: Record<string, string>;
  targetOutputs?: string[];
  approvedEffects?: string[];
  currentRun?: CurrentRunSet;
  currentRunPath?: string;
}

export interface PackageEntrypointPlanResult {
  package_plan_version: "0.1";
  entrypoint: {
    ref: string;
    component_id: string;
    name: string;
    path: string;
  };
  plan: ExecutionPlan;
  components: ComponentIR[];
  edges: GraphEdgeIR[];
  diagnostics: Diagnostic[];
}

export interface PackageEntrypointRuntimeIrResult {
  runtime_ir_version: "0.1";
  entrypoint: PackageEntrypointPlanResult["entrypoint"];
  ir: ProseIR;
  diagnostics: Diagnostic[];
}

export async function planPackageEntrypoint(
  ir: PackageIR,
  options: PackageEntrypointPlanOptions,
): Promise<PackageEntrypointPlanResult> {
  const currentRun = options.currentRunPath
    ? await loadCurrentRunSet(options.currentRunPath)
    : options.currentRun ?? { graph: null, nodes: [] };
  return planPackageEntrypointSync(ir, { ...options, currentRun });
}

export function planPackageEntrypointSync(
  ir: PackageIR,
  options: PackageEntrypointPlanOptions & { currentRun?: CurrentRunSet },
): PackageEntrypointPlanResult {
  const entrypoint = resolveEntrypoint(ir, options.entrypoint);
  if (!entrypoint) {
    const diagnostic: Diagnostic = {
      severity: "error",
      code: "deployment_entrypoint_not_found",
      message: `Package entrypoint '${options.entrypoint}' was not found.`,
    };
    return emptyPackagePlan(ir, options.entrypoint, diagnostic);
  }

  const components = reachableExecutionComponents(ir, entrypoint);
  const componentIds = new Set(components.map((component) => component.id));
  const edges = ir.graph.edges.filter(
    (edge) =>
      (componentIds.has(edge.from.component) || edge.from.component === "$caller") &&
      (componentIds.has(edge.to.component) || edge.to.component === "$return"),
  );
  const diagnostics = [
    ...ir.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
    ...unresolvedServiceDiagnostics(components, edges),
  ];
  const currentByComponent = new Map(
    (options.currentRun?.nodes ?? []).map((record) => [record.component_ref, record]),
  );
  const approvedEffects = new Set(options.approvedEffects ?? []);
  const inputs = options.inputs ?? {};
  const requestedOutputs =
    options.targetOutputs && options.targetOutputs.length > 0
      ? [...new Set(options.targetOutputs)].sort()
      : entrypoint.ports.ensures.map((port) => port.name).sort();
  const planNodes = components.map((component) =>
    packagePlanNode({
      ir,
      component,
      entrypoint,
      edges,
      inputs,
      currentRecord: currentByComponent.get(component.name) ?? null,
      approvedEffects,
    }),
  );
  const missingOutputs = requestedOutputs
    .filter((output) => !entrypoint.ports.ensures.some((port) => port.name === output))
    .map((output) => `Requested output '${output}' is not produced by entrypoint '${entrypoint.name}'.`);
  const graphStaleReasons = options.currentRun?.graph ? [] : ["no_current_run"];
  const graphBlockedReasons = [
    ...missingOutputs,
    ...diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message),
  ];
  const materializedNodes = planNodes.filter(
    (node) => node.status !== "current" && node.status !== "skipped",
  );
  const plan: ExecutionPlan = {
    plan_version: "0.1",
    component_ref: entrypoint.name,
    ir_hash: ir.semantic_hash,
    requested_outputs: requestedOutputs,
    approved_effects: [...approvedEffects].sort(),
    status: planStatus(planNodes, graphBlockedReasons),
    graph_stale_reasons: graphStaleReasons,
    graph_blocked_reasons: graphBlockedReasons,
    materialization_set: {
      graph: graphBlockedReasons.length === 0 && materializedNodes.length > 0,
      nodes: materializedNodes.map((node) => node.component_ref),
    },
    nodes: planNodes,
    diagnostics,
  };

  return {
    package_plan_version: "0.1",
    entrypoint: {
      ref: entrypoint.name,
      component_id: entrypoint.id,
      name: entrypoint.name,
      path: entrypoint.source.path,
    },
    plan,
    components,
    edges,
    diagnostics,
  };
}

export function buildPackageEntrypointGraphView(
  result: PackageEntrypointPlanResult,
): GraphView {
  const planNodes = new Map(result.plan.nodes.map((node) => [node.node_id, node]));
  const selected = new Set(result.plan.materialization_set.nodes);
  const nodes: GraphViewNode[] = [];

  if (
    result.edges.some((edge) => edge.from.component === "$caller") ||
    result.components.some((component) => component.id === result.entrypoint.component_id)
  ) {
    nodes.push(boundaryNode("$caller", "Caller"));
  }

  for (const component of result.components) {
    nodes.push(componentGraphNode(component, planNodes.get(component.id), selected));
  }

  if (result.edges.some((edge) => edge.to.component === "$return")) {
    nodes.push(boundaryNode("$return", "Return"));
  }

  const edges: GraphViewEdge[] = result.edges.map((edge) => ({
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
    component_ref: result.plan.component_ref,
    requested_outputs: result.plan.requested_outputs,
    nodes,
    edges,
    diagnostics: result.plan.diagnostics,
  };
}

export function buildPackageEntrypointRuntimeIr(
  packageIr: PackageIR,
  result: PackageEntrypointPlanResult,
): PackageEntrypointRuntimeIrResult {
  const componentIds = new Set(result.components.map((component) => component.id));
  const runtimeEdges = runtimeEdgesForEntrypoint(result, componentIds);
  const runtimeComponents = result.components.map((component) =>
    runtimeComponentForEntrypoint(component, {
      entrypointId: result.entrypoint.component_id,
      edges: runtimeEdges,
    }),
  );

  return {
    runtime_ir_version: "0.1",
    entrypoint: result.entrypoint,
    ir: {
      ir_version: "0.1",
      semantic_hash: packageIr.semantic_hash,
      package: {
        name: packageIr.manifest.name,
        source_ref: packageIr.manifest.registry_ref ?? packageIr.manifest.name,
        source_sha: packageIr.hashes.source_hash,
        dependencies: packageIr.dependencies,
      },
      components: runtimeComponents,
      graph: {
        nodes: runtimeComponents.map((component) => ({
          id: component.id,
          component: component.id,
          kind: component.kind,
          source_span: component.source.span,
        })),
        edges: runtimeEdges,
      },
      diagnostics: result.diagnostics,
    },
    diagnostics: result.diagnostics,
  };
}

function runtimeEdgesForEntrypoint(
  result: PackageEntrypointPlanResult,
  componentIds: Set<string>,
): GraphEdgeIR[] {
  const requestedOutputs = new Set(result.plan.requested_outputs);
  const edges = result.edges
    .flatMap((edge): GraphEdgeIR[] => {
      if (edge.kind === "caller") {
        return edge.to.component === result.entrypoint.component_id ? [edge] : [];
      }
      if (edge.kind === "return") {
        return requestedOutputs.has(edge.to.port) ? [edge] : [];
      }
      if (edge.kind === "execution") {
        if (!componentIds.has(edge.from.component) || !componentIds.has(edge.to.component)) {
          return [];
        }
        return [{
          from: {
            component: edge.to.component,
            port: "$complete",
          },
          to: {
            component: edge.from.component,
            port: edge.from.port,
          },
          kind: "execution",
          confidence: edge.confidence,
          reason: `Runtime dependency for ${edge.reason}`,
          source: edge.source,
        }];
      }
      if (componentIds.has(edge.from.component) && componentIds.has(edge.to.component)) {
        return [edge];
      }
      return [];
    })
    .sort(sortEdges);

  for (const output of requestedOutputs) {
    const exists = edges.some(
      (edge) => edge.to.component === "$return" && edge.to.port === output,
    );
    if (!exists) {
      edges.push({
        from: {
          component: result.entrypoint.component_id,
          port: output,
        },
        to: {
          component: "$return",
          port: output,
        },
        kind: "return",
        confidence: 0.8,
        reason: `Entrypoint output '${output}' is returned by '${result.entrypoint.name}'.`,
        source: "auto",
      });
    }
  }

  return edges.sort(sortEdges);
}

function sortEdges(a: GraphEdgeIR, b: GraphEdgeIR): number {
  return (
    a.from.component.localeCompare(b.from.component) ||
    a.from.port.localeCompare(b.from.port) ||
    a.to.component.localeCompare(b.to.component) ||
    a.to.port.localeCompare(b.to.port)
  );
}

function runtimeComponentForEntrypoint(
  component: ComponentIR,
  options: {
    entrypointId: string;
    edges: GraphEdgeIR[];
  },
): ComponentIR {
  const isEntrypoint = component.id === options.entrypointId;
  return {
    ...component,
    ports: {
      requires: component.ports.requires.map((port) =>
        runtimePortForEntrypoint(port, {
          componentId: component.id,
          isEntrypoint,
          edges: options.edges,
        }),
      ),
      ensures: component.ports.ensures,
    },
  };
}

function runtimePortForEntrypoint(
  port: PortIR,
  options: {
    componentId: string;
    isEntrypoint: boolean;
    edges: GraphEdgeIR[];
  },
): PortIR {
  if (!port.required || options.isEntrypoint) {
    return port;
  }

  const hasDataDependency = options.edges.some(
    (edge) =>
      edge.to.component === options.componentId &&
      edge.to.port === port.name &&
      edge.from.component !== "$caller",
  );
  if (hasDataDependency) {
    return port;
  }

  return {
    ...port,
    required: false,
    description: port.description
      ? `${port.description} Resolved by the package entrypoint at runtime.`
      : "Resolved by the package entrypoint at runtime.",
  };
}

function packagePlanNode(options: {
  ir: PackageIR;
  component: ComponentIR;
  entrypoint: ComponentIR;
  edges: GraphEdgeIR[];
  inputs: Record<string, string>;
  currentRecord: RunRecord | null;
  approvedEffects: Set<string>;
}): PlanNode {
  const staleReasons = staleReasonsForComponent(options.ir, options.component, options.currentRecord);
  const missingInputs =
    options.component.id === options.entrypoint.id
      ? options.component.ports.requires
          .filter((port) => port.required && options.inputs[port.name] === undefined)
          .map((port) => `Missing required input '${port.name}'.`)
      : [];
  const unsafeEffects =
    staleReasons.length > 0
      ? unsafeEffectKinds(options.component, options.approvedEffects).map(
          (effect) => `Effect '${effect}' requires a gate before execution.`,
        )
      : [];
  const blockedReasons = [...missingInputs, ...unsafeEffects];
  const status = nodeStatus(staleReasons, blockedReasons, unsafeEffects);

  return {
    node_id: options.component.id,
    component_ref: options.component.name,
    status,
    stale_reasons: staleReasons,
    blocked_reasons: blockedReasons,
    depends_on: packageDependenciesFor(options.component.id, options.edges),
    effects: options.component.effects.map((effect) => effect.kind),
    current_run_id: options.currentRecord?.run_id ?? null,
  };
}

function reachableExecutionComponents(ir: PackageIR, entrypoint: ComponentIR): ComponentIR[] {
  const byId = new Map(ir.components.map((component) => [component.id, component]));
  const selected = new Set<string>();
  const queue = [entrypoint.id];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || selected.has(current)) {
      continue;
    }
    selected.add(current);

    for (const edge of ir.graph.edges) {
      if (
        edge.kind === "execution" &&
        edge.from.component === current &&
        byId.has(edge.to.component)
      ) {
        queue.push(edge.to.component);
      }
    }
  }

  const order = new Map(ir.components.map((component, index) => [component.id, index]));
  const ordered = [...selected]
    .map((id) => byId.get(id))
    .filter((component): component is ComponentIR => Boolean(component))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return [
    entrypoint,
    ...ordered.filter((component) => component.id !== entrypoint.id),
  ];
}

function resolveEntrypoint(ir: PackageIR, ref: string): ComponentIR | null {
  return (
    ir.components.find(
      (component) =>
        component.name === ref ||
        component.id === ref ||
        component.source.path === ref ||
        `${ir.manifest.registry_ref ?? ir.manifest.name}#${component.name}` === ref,
    ) ?? null
  );
}

function unresolvedServiceDiagnostics(
  components: ComponentIR[],
  edges: GraphEdgeIR[],
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const component of components) {
    for (const service of component.services) {
      const resolved = edges.some(
        (edge) =>
          edge.kind === "execution" &&
          edge.from.component === component.id &&
          edge.reason.includes(`'${service.name}'`),
      );
      if (!resolved) {
        diagnostics.push({
          severity: "error",
          code: "deployment_service_unresolved",
          message: `Service '${service.name}' referenced by '${component.name}' is not resolved in the package graph.`,
          source_span: service.source_span,
        });
      }
    }
  }

  return diagnostics;
}

function staleReasonsForComponent(
  ir: PackageIR,
  component: ComponentIR,
  currentRecord: RunRecord | null,
): string[] {
  if (!currentRecord) {
    return ["no_current_run"];
  }
  const reasons: string[] = [];
  if (currentRecord.status !== "succeeded") {
    reasons.push(`run_status:${currentRecord.status}`);
  }
  if (
    currentRecord.acceptance.status !== "accepted" &&
    currentRecord.acceptance.status !== "not_required"
  ) {
    reasons.push(`acceptance:${currentRecord.acceptance.status}`);
  }
  if (currentRecord.component_version.source_sha !== ir.hashes.source_hash) {
    reasons.push("source_hash_changed");
  }
  if (currentRecord.component_version.ir_hash !== ir.semantic_hash) {
    reasons.push("ir_hash_changed");
  }
  for (const port of component.ports.ensures) {
    if (!currentRecord.outputs.some((output) => output.port === port.name)) {
      reasons.push(`output_missing:${port.name}`);
    }
  }
  return reasons;
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
  graphBlockedReasons: string[],
): ExecutionPlan["status"] {
  if (
    graphBlockedReasons.length > 0 ||
    nodes.some((node) => node.status === "blocked_input" || node.status === "blocked_effect")
  ) {
    return "blocked";
  }
  if (nodes.length > 0 && nodes.every((node) => node.status === "current")) {
    return "current";
  }
  return "ready";
}

function packageDependenciesFor(componentId: string, edges: GraphEdgeIR[]): string[] {
  return [...new Set(
    edges
      .filter(
        (edge) =>
          edge.to.component === componentId &&
          edge.from.component !== "$caller" &&
          edge.from.component !== "$return" &&
          edge.kind !== "execution",
      )
      .map((edge) => edge.from.component),
  )].sort();
}

function unsafeEffectKinds(component: ComponentIR, approvedEffects: Set<string>): string[] {
  const kinds = component.effects.map((effect) => effect.kind);
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === "pure")) {
    return [];
  }
  return kinds.filter(
    (kind) => kind !== "pure" && kind !== "read_external" && !approvedEffects.has(kind),
  );
}

function componentGraphNode(
  component: ComponentIR,
  planNode: PlanNode | undefined,
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

function emptyPackagePlan(
  ir: PackageIR,
  entrypoint: string,
  diagnostic: Diagnostic,
): PackageEntrypointPlanResult {
  const plan: ExecutionPlan = {
    plan_version: "0.1",
    component_ref: entrypoint,
    ir_hash: ir.semantic_hash,
    requested_outputs: [],
    approved_effects: [],
    status: "blocked",
    graph_stale_reasons: [],
    graph_blocked_reasons: [diagnostic.message],
    materialization_set: { graph: false, nodes: [] },
    nodes: [],
    diagnostics: [diagnostic],
  };
  return {
    package_plan_version: "0.1",
    entrypoint: {
      ref: entrypoint,
      component_id: "",
      name: entrypoint,
      path: "",
    },
    plan,
    components: [],
    edges: [],
    diagnostics: [diagnostic],
  };
}
