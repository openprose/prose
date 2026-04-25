import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { compileSource } from "../compiler.js";
import { collectSourceFiles } from "../files.js";
import { sha256, stableStringify } from "../hash.js";
import { parseContractMarkdown } from "../markdown.js";
import { buildRegistryRef } from "../registry.js";
import { slugify } from "../text.js";
import type {
  ComponentIR,
  Diagnostic,
  GraphEdgeIR,
  GraphIR,
  PackageIR,
  PackageIRFile,
  ProseIR,
  SourceSpan,
} from "../types.js";

interface PackageConfig {
  name?: string;
  version?: string;
  registry?: {
    catalog?: string;
  };
  description?: string;
  license?: string;
  source?: {
    git?: string;
    sha?: string;
    subpath?: string;
  };
  schemas?: string[];
  evals?: string[];
  examples?: string[];
  hosted?: PackageIR["manifest"]["hosted"];
}

interface SourceEntry {
  absolutePath: string;
  relativePath: string;
  source: string;
  componentNames: string[];
}

export async function compilePackagePath(path: string): Promise<PackageIR> {
  const root = await resolvePackageRoot(path);
  const config = await loadPackageConfig(root);
  const files = await collectSourceFiles(root, {
    excludeNestedPackageRoots: true,
  });
  const diagnostics: Diagnostic[] = [];
  const sources = await readSourceEntries(files, root, diagnostics);
  const availableComponentNames = new Set(
    sources.flatMap((source) => source.componentNames),
  );
  const packageFiles: PackageIRFile[] = [];
  const components: ComponentIR[] = [];
  const dependencies = new Map<string, ProseIR["package"]["dependencies"][number]>();

  for (const source of sources) {
    const fileIr = compileSource(source.source, {
      path: source.absolutePath,
      availableComponentNames,
    });
    const rebasedDiagnostics = fileIr.diagnostics.map((diagnostic) =>
      rebaseDiagnostic(diagnostic, source.relativePath),
    );
    diagnostics.push(...rebasedDiagnostics);
    const idMap = new Map<string, string>();
    const prefix = fileComponentPrefix(source.relativePath);

    for (const component of fileIr.components) {
      idMap.set(component.id, `${prefix}--${component.id}`);
    }

    const fileComponents = fileIr.components.map((component) =>
      rebaseComponent(component, source.relativePath, idMap.get(component.id) ?? component.id),
    );
    components.push(...fileComponents);
    packageFiles.push({
      path: source.relativePath,
      source_sha: sha256(source.source),
      semantic_hash: fileIr.semantic_hash,
      component_ids: fileComponents.map((component) => component.id),
      diagnostics: rebasedDiagnostics,
    });

    for (const dependency of fileIr.package.dependencies) {
      const key = `${dependency.package}@${dependency.sha}`;
      const existing = dependencies.get(key);
      if (!existing) {
        dependencies.set(key, {
          ...dependency,
          refs: [...dependency.refs].sort(),
        });
        continue;
      }
      existing.refs = Array.from(new Set([...existing.refs, ...dependency.refs])).sort();
    }
  }

  resolveCompositeExpansions(components);
  const manifest = buildPackageManifest(root, config);
  const graph = buildPackageGraph(components, diagnostics);
  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const withoutHash = {
    package_ir_version: "0.1" as const,
    semantic_hash: "",
    root: normalizePath(root),
    manifest,
    files: packageFiles.sort((a, b) => a.path.localeCompare(b.path)),
    dependencies: Array.from(dependencies.values()).sort((a, b) =>
      a.package.localeCompare(b.package) || a.sha.localeCompare(b.sha),
    ),
    components: components.sort(
      (a, b) => a.source.path.localeCompare(b.source.path) || a.id.localeCompare(b.id),
    ),
    graph,
    diagnostics: sortedDiagnostics,
  };

  return {
    ...withoutHash,
    semantic_hash: sha256(stableStringify(packageSemanticProjection(withoutHash))),
  };
}

async function readSourceEntries(
  files: string[],
  root: string,
  diagnostics: Diagnostic[],
): Promise<SourceEntry[]> {
  const entries: SourceEntry[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relativePath = normalizePath(relative(root, file));
    const drafts = parseContractMarkdown(source, relativePath, diagnostics);
    entries.push({
      absolutePath: file,
      relativePath,
      source,
      componentNames: drafts.map((draft) => draft.name),
    });
  }
  return entries.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function buildPackageManifest(root: string, config: PackageConfig | null): PackageIR["manifest"] {
  const name = config?.name?.trim() || basename(root);
  const version = config?.version?.trim() || null;
  const catalog = config?.registry?.catalog?.trim() || "openprose";
  return {
    name,
    version,
    catalog,
    registry_ref: version
      ? buildRegistryRef({
          catalog,
          package_name: name,
          version,
        })
      : null,
    description: config?.description?.trim() || null,
    license: config?.license?.trim() || null,
    source: {
      git: config?.source?.git?.trim() || null,
      sha: config?.source?.sha?.trim() || null,
      subpath: config?.source?.subpath?.trim() || null,
    },
    schemas: [...(config?.schemas ?? [])].sort(),
    evals: [...(config?.evals ?? [])].sort(),
    examples: [...(config?.examples ?? [])].sort(),
    no_evals: (config?.evals?.length ?? 0) === 0,
    hosted: config?.hosted ?? null,
  };
}

function buildPackageGraph(components: ComponentIR[], diagnostics: Diagnostic[]): GraphIR {
  const nodes = components.map((component) => ({
    id: component.id,
    component: component.id,
    kind: component.kind,
    source_span: component.source.span,
  }));
  const edges: GraphEdgeIR[] = [];
  const edgeKeys = new Set<string>();
  const providersByPort = new Map<string, ComponentIR[]>();
  const componentsByName = new Map<string, ComponentIR[]>();

  for (const component of components) {
    const named = componentsByName.get(component.name) ?? [];
    named.push(component);
    componentsByName.set(component.name, named);

    for (const port of component.ports.ensures) {
      const providers = providersByPort.get(port.name) ?? [];
      providers.push(component);
      providersByPort.set(port.name, providers);
    }
  }

  for (const component of components) {
    for (const service of component.services) {
      const targetName = serviceTargetName(service);
      const matches = (componentsByName.get(service.name) ?? []).filter(
        (candidate) => candidate.id !== component.id,
      );
      const composeMatches = targetName === service.name
        ? matches
        : (componentsByName.get(targetName) ?? []).filter(
            (candidate) => candidate.id !== component.id,
          );
      const resolvedMatches = service.compose ? composeMatches : matches;
      if (resolvedMatches.length > 1) {
        diagnostics.push({
          severity: "warning",
          code: "ambiguous_package_service_reference",
          message: `Service '${service.name}' resolves to multiple package components.`,
          source_span: service.source_span,
        });
      }
      if (resolvedMatches.length > 0) {
        addEdge(edges, edgeKeys, {
          from: { component: component.id, port: service.compose ? "$compose" : "$call" },
          to: { component: resolvedMatches[0].id, port: "$entry" },
          kind: "execution",
          confidence: 1,
          reason: service.compose
            ? `Composite expansion '${service.name}' uses '${service.compose}'.`
            : `Package service reference '${service.name}'.`,
          source: "execution",
        });
      }
    }

    for (const port of component.ports.requires) {
      const matchingProviders = (providersByPort.get(port.name) ?? []).filter(
        (provider) => provider.id !== component.id,
      );
      if (matchingProviders.length > 1) {
        diagnostics.push({
          severity: "warning",
          code: "ambiguous_package_exact_wiring",
          message: `Multiple package components ensure '${port.name}'. Exact wiring needs an explicit tie-breaker.`,
          source_span: port.source_span,
        });
      }
      if (matchingProviders.length > 0) {
        addEdge(edges, edgeKeys, {
          from: { component: matchingProviders[0].id, port: port.name },
          to: { component: component.id, port: port.name },
          kind: "exact",
          confidence: 1,
          reason: `Package-wide exact port name match for '${port.name}'.`,
          source: "auto",
        });
      } else if (component.kind === "program" || isRunType(port.type)) {
        addEdge(edges, edgeKeys, {
          from: { component: "$caller", port: port.name },
          to: { component: component.id, port: port.name },
          kind: "caller",
          confidence: 1,
          reason: `Package entry input '${port.name}' is caller-provided.`,
          source: "auto",
        });
      }
    }

    if (component.kind === "program") {
      for (const port of component.ports.ensures) {
        const matchingProviders = (providersByPort.get(port.name) ?? []).filter(
          (provider) => provider.id !== component.id,
        );
        const provider = matchingProviders[0] ?? component;
        addEdge(edges, edgeKeys, {
          from: { component: provider.id, port: port.name },
          to: { component: "$return", port: port.name },
          kind: "return",
          confidence: provider.id === component.id ? 0.8 : 1,
          reason:
            provider.id === component.id
              ? `Program output '${port.name}' is produced directly by '${component.name}'.`
              : `Program output '${port.name}' is produced by '${provider.name}'.`,
          source: "auto",
        });
      }
    }
  }

  return {
    nodes,
    edges: edges.sort(
      (a, b) =>
        a.from.component.localeCompare(b.from.component) ||
        a.from.port.localeCompare(b.from.port) ||
        a.to.component.localeCompare(b.to.component) ||
        a.to.port.localeCompare(b.to.port),
    ),
  };
}

function resolveCompositeExpansions(components: ComponentIR[]): void {
  const byName = new Map<string, ComponentIR[]>();
  for (const component of components) {
    const existing = byName.get(component.name) ?? [];
    existing.push(component);
    byName.set(component.name, existing);
  }

  for (const component of components) {
    component.expansions = component.expansions.map((expansion) => {
      const targetName = composeRefName(expansion.compose_ref);
      const resolved = (byName.get(targetName) ?? []).find(
        (candidate) => candidate.kind === "composite",
      );
      if (!resolved) {
        return expansion;
      }
      return {
        ...expansion,
        status: "resolved",
        resolved_component_id: resolved.id,
        definition_source_span: resolved.source.span,
      };
    });
  }
}

function rebaseComponent(component: ComponentIR, relativePath: string, id: string): ComponentIR {
  return {
    ...component,
    id,
    source: {
      path: relativePath,
      span: rebaseSpan(component.source.span, relativePath),
    },
    ports: {
      requires: component.ports.requires.map((port) => ({
        ...port,
        source_span: rebaseSpan(port.source_span, relativePath),
      })),
      ensures: component.ports.ensures.map((port) => ({
        ...port,
        source_span: rebaseSpan(port.source_span, relativePath),
      })),
    },
    services: component.services.map((service) => ({
      ...service,
      source_span: rebaseSpan(service.source_span, relativePath),
    })),
    runtime: component.runtime.map((setting) => ({
      ...setting,
      source_span: rebaseSpan(setting.source_span, relativePath),
    })),
    environment: component.environment.map((environment) => ({
      ...environment,
      source_span: rebaseSpan(environment.source_span, relativePath),
    })),
    execution: component.execution
      ? {
          ...component.execution,
          source_span: rebaseSpan(component.execution.source_span, relativePath),
        }
      : null,
    effects: component.effects.map((effect) => ({
      ...effect,
      source_span: rebaseSpan(effect.source_span, relativePath),
    })),
    access: {
      ...component.access,
      source_span: component.access.source_span
        ? rebaseSpan(component.access.source_span, relativePath)
        : undefined,
    },
    expansions: component.expansions.map((expansion) => ({
      ...expansion,
      id: `${id}--${slugify(expansion.service_name)}--expansion`,
      parent_component_id: id,
      source_span: rebaseSpan(expansion.source_span, relativePath),
      definition_source_span: expansion.definition_source_span
        ? rebaseSpan(expansion.definition_source_span, relativePath)
        : null,
    })),
  };
}

function rebaseDiagnostic(diagnostic: Diagnostic, relativePath: string): Diagnostic {
  return {
    ...diagnostic,
    source_span: diagnostic.source_span
      ? rebaseSpan(diagnostic.source_span, relativePath)
      : undefined,
  };
}

function rebaseSpan(span: SourceSpan, relativePath: string): SourceSpan {
  return {
    ...span,
    path: relativePath,
  };
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

function packageSemanticProjection(ir: Omit<PackageIR, "semantic_hash">): unknown {
  return {
    package_ir_version: ir.package_ir_version,
    manifest: ir.manifest,
    files: ir.files.map((file) => ({
      path: file.path,
      source_sha: file.source_sha,
      semantic_hash: file.semantic_hash,
      component_ids: file.component_ids,
      diagnostics: file.diagnostics.map(projectDiagnostic),
    })),
    dependencies: ir.dependencies,
    components: ir.components.map((component) => ({
      id: component.id,
      name: component.name,
      kind: component.kind,
      source: component.source.path,
      ports: component.ports,
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
      expansions: component.expansions.map((expansion) => ({
        id: expansion.id,
        parent_component_id: expansion.parent_component_id,
        service_name: expansion.service_name,
        compose_ref: expansion.compose_ref,
        with: expansion.with,
        status: expansion.status,
        resolved_component_id: expansion.resolved_component_id,
      })),
    })),
    graph: {
      nodes: ir.graph.nodes.map((node) => ({
        id: node.id,
        component: node.component,
        kind: node.kind,
      })),
      edges: ir.graph.edges,
    },
    diagnostics: ir.diagnostics.map(projectDiagnostic),
  };
}

function projectDiagnostic(diagnostic: Diagnostic): unknown {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    source_span: diagnostic.source_span,
  };
}

async function resolvePackageRoot(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  if (info.isDirectory()) {
    return nearestPackageRoot(resolved);
  }
  return nearestPackageRoot(dirname(resolved));
}

function nearestPackageRoot(start: string): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(resolve(current, "prose.package.json"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      return resolve(start);
    }
    current = parent;
  }
}

async function loadPackageConfig(root: string): Promise<PackageConfig | null> {
  const configPath = resolve(root, "prose.package.json");
  if (!existsSync(configPath)) {
    return null;
  }
  return JSON.parse(await readFile(configPath, "utf8")) as PackageConfig;
}

function fileComponentPrefix(path: string): string {
  return slugify(
    path
      .replace(/\.prose\.md$/, "")
      .replace(/\.md$/, "")
      .replace(/[\\/]+/g, "-"),
  );
}

function isRunType(type: string): boolean {
  return type === "run" || type === "run[]" || /^run<.+>(\[\])?$/.test(type);
}

function serviceTargetName(service: ComponentIR["services"][number]): string {
  return service.compose ? composeRefName(service.compose) : service.name;
}

function composeRefName(ref: string): string {
  const normalized = ref.replace(/^registry:\/\/[^/]+\//, "");
  const pathPart = normalized.split("@")[0] ?? normalized;
  const segments = pathPart.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? pathPart;
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const spanA = a.source_span;
    const spanB = b.source_span;
    return (
      (spanA?.path ?? "").localeCompare(spanB?.path ?? "") ||
      (spanA?.start_line ?? 0) - (spanB?.start_line ?? 0) ||
      a.code.localeCompare(b.code)
    );
  });
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
