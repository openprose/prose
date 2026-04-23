import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolvePackageDependencies } from "./dependencies";
import { sha256, stableStringify } from "./hash";
import { findSection, parseContractMarkdown } from "./markdown";
import {
  parseAccess,
  parseEffects,
  parseEnvironment,
  parseExecution,
  parsePorts,
  parseRuntime,
  parseServices,
} from "./sections";
import { slugify } from "./text";
import type {
  ComponentIR,
  Diagnostic,
  GraphEdgeIR,
  GraphIR,
  PortIR,
  ProseIR,
} from "./types";

export interface CompileOptions {
  path: string;
}

export async function compileFile(path: string): Promise<ProseIR> {
  const source = await readFile(resolve(path), "utf8");
  return compileSource(source, { path });
}

export function compileSource(source: string, options: CompileOptions): ProseIR {
  const diagnostics: Diagnostic[] = [];
  const path = normalizePath(options.path);
  const drafts = parseContractMarkdown(source, path, diagnostics);
  const idCounts = new Map<string, number>();
  const components = drafts.map((draft) => {
    const baseId = slugify(draft.name);
    const count = idCounts.get(baseId) ?? 0;
    idCounts.set(baseId, count + 1);
    const id = count === 0 ? baseId : `${baseId}-${count + 1}`;

    const component: ComponentIR = {
      id,
      name: draft.name,
      kind: draft.kind,
      source: {
        path,
        span: draft.sourceSpan,
      },
      ports: {
        requires: parsePorts(findSection(draft, "requires"), "input", diagnostics),
        ensures: parsePorts(findSection(draft, "ensures"), "output", diagnostics),
      },
      services: parseServices(findSection(draft, "services")),
      schemas: [],
      runtime: parseRuntime(findSection(draft, "runtime"), diagnostics),
      environment: parseEnvironment(
        findSection(draft, "environment"),
        diagnostics,
      ),
      execution: parseExecution(findSection(draft, "execution"), diagnostics),
      effects: parseEffects(findSection(draft, "effects"), diagnostics),
      access: parseAccess(findSection(draft, "access")),
      evals: [],
      expansions: [],
    };

    return component;
  });

  const graph = buildGraph(components, diagnostics);
  const dependencies = resolvePackageDependencies(path, source, components, diagnostics);
  const withoutHash = {
    ir_version: "0.1" as const,
    semantic_hash: "",
    package: {
      name: components[0]?.name ?? "package",
      source_ref: path,
      source_sha: sha256(source),
      dependencies,
    },
    components,
    graph,
    diagnostics,
  };

  return {
    ...withoutHash,
    semantic_hash: sha256(stableStringify(toSemanticProjection(withoutHash))),
  };
}

function buildGraph(
  components: ComponentIR[],
  diagnostics: Diagnostic[],
): GraphIR {
  const nodes = components.map((component) => ({
    id: component.id,
    component: component.id,
    kind: component.kind,
    source_span: component.source.span,
  }));

  const edges: GraphEdgeIR[] = [];
  const edgeKeys = new Set<string>();
  const main = components.find((component) => component.kind === "program");
  const providers = new Map<string, ComponentIR[]>();
  const programInputs = new Map<string, PortIR>();

  if (main) {
    for (const port of main.ports.requires) {
      programInputs.set(port.name, port);
    }

    const inlineIds = new Set(components.map((component) => component.name));
    for (const service of main.services) {
      if (!inlineIds.has(service.name) && !service.compose) {
        diagnostics.push({
          severity: "warning",
          code: "unresolved_service_reference",
          message: `Service '${service.name}' is declared but no inline component was found in this compile unit.`,
          source_span: service.source_span,
        });
      }
    }
  }

  for (const component of components) {
    for (const port of component.ports.ensures) {
      const existing = providers.get(port.name) ?? [];
      existing.push(component);
      providers.set(port.name, existing);
    }
  }

  for (const consumer of components) {
    if (consumer === main) {
      continue;
    }

    for (const port of consumer.ports.requires) {
      const matchingProviders = (providers.get(port.name) ?? []).filter(
        (provider) => provider.id !== consumer.id,
      );

      if (matchingProviders.length > 1) {
        diagnostics.push({
          severity: "warning",
          code: "ambiguous_exact_wiring",
          message: `Multiple components ensure '${port.name}'. Exact wiring needs an explicit tie-breaker.`,
          source_span: port.source_span,
        });
      }

      if (matchingProviders.length > 0) {
        addEdge(edges, edgeKeys, {
          from: { component: matchingProviders[0].id, port: port.name },
          to: { component: consumer.id, port: port.name },
          kind: "exact",
          confidence: 1,
          reason: `Exact port name match for '${port.name}'.`,
          source: "auto",
        });
      } else if (main && (programInputs.has(port.name) || isRunType(port.type))) {
        addEdge(edges, edgeKeys, {
          from: { component: "$caller", port: port.name },
          to: { component: consumer.id, port: port.name },
          kind: "caller",
          confidence: 1,
          reason: isRunType(port.type)
            ? `Run-typed input '${port.name}' is caller-provided.`
            : `Program input '${port.name}' satisfies service input.`,
          source: "auto",
        });
      } else if (main) {
        diagnostics.push({
          severity: "warning",
          code: "unresolved_dependency",
          message: `No exact provider found for '${consumer.name}.${port.name}'. Semantic wiring is not implemented in this compiler slice.`,
          source_span: port.source_span,
        });
      }
    }
  }

  if (main) {
    for (const port of main.ports.ensures) {
      const matchingProviders = (providers.get(port.name) ?? []).filter(
        (provider) => provider.id !== main.id,
      );
      if (matchingProviders.length > 0) {
        addEdge(edges, edgeKeys, {
          from: { component: matchingProviders[0].id, port: port.name },
          to: { component: "$return", port: port.name },
          kind: "return",
          confidence: 1,
          reason: `Program output '${port.name}' is produced by '${matchingProviders[0].name}'.`,
          source: "auto",
        });
      }
    }
  }

  return { nodes, edges };
}

function addEdge(
  edges: GraphEdgeIR[],
  edgeKeys: Set<string>,
  edge: GraphEdgeIR,
): void {
  const key = `${edge.from.component}:${edge.from.port}->${edge.to.component}:${edge.to.port}`;
  if (edgeKeys.has(key)) {
    return;
  }
  edgeKeys.add(key);
  edges.push(edge);
}

function isRunType(type: string): boolean {
  return type === "run" || type === "run[]" || /^run<.+>(\[\])?$/.test(type);
}

function toSemanticProjection(ir: Omit<ProseIR, "semantic_hash">): unknown {
  return {
    ir_version: ir.ir_version,
    package: {
      name: ir.package.name,
    },
    components: ir.components.map((component) => ({
      id: component.id,
      name: component.name,
      kind: component.kind,
      ports: {
        requires: component.ports.requires.map(projectPort),
        ensures: component.ports.ensures.map(projectPort),
      },
      services: component.services.map((service) => ({
        name: service.name,
        ref: service.ref,
        compose: service.compose,
        with: service.with,
      })),
      schemas: component.schemas,
      runtime: component.runtime.map((setting) => ({
        key: setting.key,
        value: setting.value,
      })),
      environment: component.environment.map((environment) => ({
        name: environment.name,
        description: environment.description,
        required: environment.required,
      })),
      execution: component.execution
        ? {
            language: component.execution.language,
            body: component.execution.body,
          }
        : null,
      effects: component.effects.map((effect) => ({
        kind: effect.kind,
        description: effect.description,
        config: effect.config,
      })),
      access: component.access.rules,
      evals: component.evals,
      expansions: component.expansions,
    })),
    graph: {
      nodes: ir.graph.nodes.map((node) => ({
        id: node.id,
        component: node.component,
        kind: node.kind,
      })),
      edges: ir.graph.edges,
    },
  };
}

function projectPort(port: PortIR): unknown {
  return {
    name: port.name,
    direction: port.direction,
    type: port.type,
    description: port.description,
    required: port.required,
    policy_labels: port.policy_labels,
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
