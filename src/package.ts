import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { compileFile } from "./compiler";
import { collectSourceFiles } from "./files";
import { sha256, stableStringify } from "./hash";
import { compilePackagePath } from "./ir/package";
import { lintFile } from "./lint";
import { buildRegistryRef } from "./registry";
import {
  inferNodeOutputContentType,
  nodeOutputFileForPort,
} from "./node-runners/output-files";
import type {
  ComponentIR,
  Diagnostic,
  HostedRuntimeMetadata,
  PackageComponentMetadata,
  PackageMetadata,
  PackageRuntimeManifest,
  ProseIR,
} from "./types";

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
  runtime?: {
    graph_vm?: string;
    model_providers?: string[];
    default_model_provider?: string;
    default_model?: string;
    thinking?: string;
    tools?: string[];
    persist_sessions?: boolean;
    subagents?: boolean;
    subagents_enabled?: boolean;
    subagent_backend?: "pi" | "disabled";
  };
  hosted?: HostedRuntimeMetadata;
}

export async function packagePath(path: string): Promise<PackageMetadata> {
  const root = await resolvePackageRoot(path);
  const config = await loadPackageConfig(root);
  const resolvedConfig = await hydratePackageConfig(root, config);
  const packageIr = await compilePackagePath(root);
  const files = await collectSourceFiles(root, {
    excludeNestedPackageRoots: true,
  });
  const components: PackageComponentMetadata[] = [];
  const diagnostics: Diagnostic[] = [];
  const dependencyMap = new Map<string, ProseIR["package"]["dependencies"][number]>();
  const manifestName = resolvedConfig?.name?.trim() || basename(root);
  const catalog = resolvedConfig?.registry?.catalog?.trim() || "openprose";
  const registryRef = resolvedConfig?.version
    ? buildRegistryRef({
        catalog,
        package_name: manifestName,
        version: resolvedConfig.version.trim(),
      })
    : null;
  const runtimeManifest = normalizeRuntimeManifest(resolvedConfig?.runtime);
  let qualityComponentCount = 0;
  let typedPorts = 0;
  let totalPorts = 0;
  let componentsWithEffects = 0;
  let componentsWithExamples = 0;
  let componentsWithEvals = 0;
  let lintCleanComponents = 0;

  for (const file of files) {
    const ir = await compileFile(file);
    const lintDiagnostics = await lintFile(file);
    diagnostics.push(...lintDiagnostics);
    for (const dependency of ir.package.dependencies) {
      const key = `${dependency.package}@${dependency.sha}`;
      const existing = dependencyMap.get(key);
      if (!existing) {
        dependencyMap.set(key, {
          ...dependency,
          refs: [...dependency.refs].sort(),
        });
        continue;
      }
      existing.refs = Array.from(new Set([...existing.refs, ...dependency.refs])).sort();
    }

    for (const component of ir.components) {
      const countsForPublishQuality = component.kind !== "test";
      if (
        countsForPublishQuality &&
        !lintDiagnostics.some((diagnostic) => diagnostic.severity !== "info")
      ) {
        lintCleanComponents += 1;
      }
      const allPorts = [...component.ports.requires, ...component.ports.ensures];
      const typedCount = allPorts.filter((port) => port.type !== "Any").length;
      if (countsForPublishQuality) {
        qualityComponentCount += 1;
        typedPorts += typedCount;
        totalPorts += allPorts.length;
      }

      const componentMetadata = buildComponentMetadata({
        root,
        file,
        ir,
        component,
        packageRegistryRef: registryRef,
        runtime: runtimeManifest,
        packageExamples: resolvedConfig?.examples ?? [],
        packageEvals: resolvedConfig?.evals ?? [],
      });
      components.push(componentMetadata);

      if (countsForPublishQuality && component.effects.length > 0) {
        componentsWithEffects += 1;
      }
      if (countsForPublishQuality && componentMetadata.examples.length > 0) {
        componentsWithExamples += 1;
      }
      if (countsForPublishQuality && componentMetadata.evals.length > 0) {
        componentsWithEvals += 1;
      }
    }
  }

  components.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const quality = buildQualitySummary({
    componentCount: qualityComponentCount,
    typedPorts,
    totalPorts,
    componentsWithEffects,
    componentsWithExamples,
    componentsWithEvals,
    lintCleanComponents,
    components,
    config: resolvedConfig,
  });

  const manifest = {
    name: manifestName,
    version: resolvedConfig?.version?.trim() || null,
    catalog,
    registry_ref: registryRef,
    description: resolvedConfig?.description?.trim() || null,
    license: resolvedConfig?.license?.trim() || null,
    source: {
      git: resolvedConfig?.source?.git?.trim() || null,
      sha: resolvedConfig?.source?.sha?.trim() || null,
      subpath: resolvedConfig?.source?.subpath?.trim() || null,
    },
    dependencies: Array.from(dependencyMap.values()).sort((a, b) =>
      a.package.localeCompare(b.package) || a.sha.localeCompare(b.sha),
    ),
    schemas: [...(resolvedConfig?.schemas ?? [])].sort(),
    evals: [...(resolvedConfig?.evals ?? [])].sort(),
    examples: [...(resolvedConfig?.examples ?? [])].sort(),
    no_evals: (resolvedConfig?.evals?.length ?? 0) === 0,
    runtime: runtimeManifest,
    hosted: resolvedConfig?.hosted ?? null,
  };
  const sortedDiagnostics = sortDiagnostics(diagnostics);
  const runtime = buildRuntimeSummary({
    manifest: runtimeManifest,
    components,
  });
  const packageIrSummary = {
    version: packageIr.package_ir_version,
    semantic_hash: packageIr.semantic_hash,
    hashes: packageIr.hashes,
  };
  const hostedIngest = {
    contract_version: "0.2" as const,
    package: {
      name: manifest.name,
      version: manifest.version,
      catalog: manifest.catalog,
      registry_ref: manifest.registry_ref,
      description: manifest.description,
      license: manifest.license,
    },
    source: manifest.source,
    package_ir: packageIrSummary,
    runtime,
    components,
    quality,
  };
  const digest = sha256(
    stableStringify({
      schema_version: "openprose.package.v2",
      package_version: "0.2",
      package_ir: packageIrSummary,
      manifest,
      components,
      diagnostics: sortedDiagnostics,
      quality,
      runtime,
      hosted_ingest: hostedIngest,
    }),
  );

  return {
    schema_version: "openprose.package.v2",
    package_version: "0.2",
    metadata_digest: digest,
    root: normalizePath(root),
    package_ir: packageIrSummary,
    manifest,
    components,
    diagnostics: sortedDiagnostics,
    quality,
    runtime,
    hosted_ingest: hostedIngest,
  };
}

export function renderPackageText(metadata: PackageMetadata): string {
  const lines = [
    `Package: ${metadata.manifest.name}${metadata.manifest.version ? `@${metadata.manifest.version}` : ""}`,
    `Root: ${metadata.root}`,
    `Components: ${metadata.components.length}`,
    `Quality score: ${metadata.quality.score.toFixed(2)}`,
    `Runtime graph VM: ${metadata.runtime.graph_vm ?? "(unspecified)"}`,
    `Model providers: ${metadata.runtime.model_providers.length > 0 ? metadata.runtime.model_providers.join(", ") : "(unspecified)"}`,
  ];

  if (metadata.quality.warnings.length > 0) {
    lines.push("Warnings:");
    for (const warning of metadata.quality.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (metadata.components.length > 0) {
    lines.push("Components:");
    for (const component of metadata.components) {
      lines.push(
        `  - ${component.name} (${component.kind}) ${component.path} score=${component.quality_score.toFixed(2)}`,
      );
      if (component.inputs.length > 0) {
        lines.push(
          `    inputs: ${component.inputs.map((port) => `${port.name}:${port.type}`).join(", ")}`,
        );
      }
      if (component.outputs.length > 0) {
        lines.push(
          `    outputs: ${component.outputs.map((port) => `${port.name}:${port.type}`).join(", ")}`,
        );
      }
      lines.push(
        `    effects: ${component.effects.length > 0 ? component.effects.join(", ") : "(none declared)"}`,
      );
      const errorCodes = component.contract.errors?.declarations.map((error) => error.code) ?? [];
      if (errorCodes.length > 0) {
        lines.push(`    errors: ${errorCodes.join(", ")}`);
      }
      if (component.contract.finally) {
        lines.push("    finally: declared");
      }
      if (component.contract.catch) {
        lines.push("    catch: declared");
      }
      if (component.warnings.length > 0) {
        for (const warning of component.warnings) {
          lines.push(`    warning: ${warning}`);
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildContractMetadata(component: ComponentIR): PackageComponentMetadata["contract"] {
  return {
    strategies: component.strategies?.body ?? null,
    errors: component.errors
      ? {
          body: component.errors.body,
          declarations: component.errors.declarations.map((error) => ({
            code: error.code,
            description: error.description,
          })),
        }
      : null,
    finally: component.finally?.body ?? null,
    catch: component.catch?.body ?? null,
    legacy_invariants: component.invariants?.body ?? null,
  };
}

function normalizeRuntimeManifest(
  runtime: PackageConfig["runtime"] | undefined,
): PackageRuntimeManifest | null {
  if (!runtime) {
    return null;
  }

  return {
    graph_vm: runtime.graph_vm?.trim() || null,
    model_providers: [...new Set(runtime.model_providers ?? [])]
      .map((modelProvider) => modelProvider.trim())
      .filter(Boolean)
      .sort(),
    default_model_provider: runtime.default_model_provider?.trim() || null,
    default_model: runtime.default_model?.trim() || null,
    thinking: runtime.thinking?.trim() || null,
    tools: [...new Set(runtime.tools ?? [])]
      .map((tool) => tool.trim())
      .filter(Boolean)
      .sort(),
    persist_sessions:
      typeof runtime.persist_sessions === "boolean" ? runtime.persist_sessions : null,
    ...normalizedPackageSubagents(runtime),
  };
}

function normalizedPackageSubagents(
  runtime: NonNullable<PackageConfig["runtime"]>,
): Pick<PackageRuntimeManifest, "subagents_enabled" | "subagent_backend"> {
  const enabled =
    typeof runtime.subagents_enabled === "boolean"
      ? runtime.subagents_enabled
      : typeof runtime.subagents === "boolean"
        ? runtime.subagents
        : runtime.subagent_backend === "disabled"
          ? false
          : runtime.subagent_backend === "pi"
            ? true
            : null;
  const backend = enabled === true ? "pi" : enabled === false ? "disabled" : null;
  return {
    ...(enabled !== null ? { subagents_enabled: enabled } : {}),
    ...(backend !== null ? { subagent_backend: backend } : {}),
  };
}

function buildRuntimeSummary(options: {
  manifest: PackageRuntimeManifest | null;
  components: PackageComponentMetadata[];
}): PackageMetadata["runtime"] {
  const requiredEffects = new Set<string>();
  const environment = new Map<string, boolean>();

  for (const component of options.components) {
    for (const effect of component.effects) {
      if (effect !== "pure") {
        requiredEffects.add(effect);
      }
    }
    for (const binding of component.runtime.environment) {
      environment.set(binding.name, (environment.get(binding.name) ?? false) || binding.required);
    }
  }

  return {
    graph_vm: options.manifest?.graph_vm ?? null,
    model_providers: options.manifest?.model_providers ?? [],
    default_model_provider: options.manifest?.default_model_provider ?? null,
    default_model: options.manifest?.default_model ?? null,
    thinking: options.manifest?.thinking ?? null,
    tools: options.manifest?.tools ?? [],
    persist_sessions: options.manifest?.persist_sessions ?? null,
    ...(options.manifest?.subagents_enabled !== undefined
      ? { subagents_enabled: options.manifest.subagents_enabled }
      : {}),
    ...(options.manifest?.subagent_backend !== undefined
      ? { subagent_backend: options.manifest.subagent_backend }
      : {}),
    required_effects: [...requiredEffects].sort(),
    environment: [...environment.entries()]
      .map(([name, required]) => ({ name, required }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function buildComponentMetadata(options: {
  root: string;
  file: string;
  ir: ProseIR;
  component: ComponentIR;
  packageRegistryRef: string | null;
  runtime: PackageRuntimeManifest | null;
  packageExamples: string[];
  packageEvals: string[];
}): PackageComponentMetadata {
  const { root, file, ir, component, packageRegistryRef, runtime, packageExamples, packageEvals } =
    options;
  const allPorts = [...component.ports.requires, ...component.ports.ensures];
  const typedCount = allPorts.filter((port) => port.type !== "Any").length;
  const typedCoverage = allPorts.length === 0 ? 1 : typedCount / allPorts.length;
  const publishable = component.kind !== "test";
  const hasEffects = publishable ? component.effects.length > 0 : true;
  const hasExamples = publishable ? packageExamples.length > 0 : true;
  const hasEvals = publishable ? packageEvals.length > 0 : true;
  const warnings: string[] = [];

  if (publishable && typedCoverage < 1) {
    warnings.push("Component has untyped ports; add explicit type names for registry search and composition.");
  }
  if (publishable && !hasEffects) {
    warnings.push("Component does not declare effects; add explicit pure/read_external/etc.");
  }
  if (publishable && !hasEvals) {
    warnings.push("Component has no linked evals; publishing should record no_evals or add eval coverage.");
  }

  const qualityScore = clamp01(
    0.2 +
      typedCoverage * 0.35 +
      (hasEffects ? 0.2 : 0) +
      (hasEvals ? 0.15 : 0) +
      (hasExamples ? 0.1 : 0),
  );

  return {
    name: component.name,
    kind: component.kind,
    path: normalizePath(relative(root, file)),
    registry_ref: packageRegistryRef ? `${packageRegistryRef}/${component.name}` : null,
    summary: summarizeComponent(component),
    inputs: component.ports.requires.map((port) => ({
      name: port.name,
      type: port.type,
      required: port.required,
      policy_labels: [...port.policy_labels].sort(),
    })),
    outputs: component.ports.ensures.map((port) => ({
      name: port.name,
      type: port.type,
      required: port.required,
      policy_labels: [...port.policy_labels].sort(),
    })),
    artifact_contract: component.ports.ensures.map((port) => {
      const defaultPath = nodeOutputFileForPort(undefined, port.name);
      return {
        port: port.name,
        type: port.type,
        required: port.required,
        default_path: defaultPath,
        content_type: inferNodeOutputContentType(defaultPath),
        policy_labels: [...port.policy_labels].sort(),
      };
    }),
    contract: buildContractMetadata(component),
    runtime: {
      graph_vm: runtime?.graph_vm ?? null,
      model_providers: runtime?.model_providers ?? [],
      effects: component.effects.map((effect) => effect.kind).sort(),
      environment: component.environment
        .map((binding) => ({ name: binding.name, required: binding.required }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    effects: component.effects.map((effect) => effect.kind),
    access: component.access.rules,
    evals: [...packageEvals].sort(),
    examples: [...packageExamples].sort(),
    quality_score: round2(qualityScore),
    ir_version: ir.ir_version,
    semantic_hash: ir.semantic_hash,
    source_sha: ir.package.source_sha,
    warnings,
  };
}

function buildQualitySummary(options: {
  componentCount: number;
  typedPorts: number;
  totalPorts: number;
  componentsWithEffects: number;
  componentsWithExamples: number;
  componentsWithEvals: number;
  lintCleanComponents: number;
  components: PackageComponentMetadata[];
  config: PackageConfig | null;
}) {
  const {
    componentCount,
    typedPorts,
    totalPorts,
    componentsWithEffects,
    componentsWithExamples,
    componentsWithEvals,
    lintCleanComponents,
    components,
    config,
  } = options;
  const typedPortCoverage = totalPorts === 0 ? 1 : typedPorts / totalPorts;
  const effectDeclarationRatio =
    componentCount === 0 ? 1 : componentsWithEffects / componentCount;
  const evalLinkRatio = componentCount === 0 ? 0 : componentsWithEvals / componentCount;
  const exampleLinkRatio =
    componentCount === 0 ? 0 : componentsWithExamples / componentCount;
  const lintHealthRatio = componentCount === 0 ? 1 : lintCleanComponents / componentCount;
  const warnings: string[] = [];

  if (!config?.version) {
    warnings.push("Missing package version in prose.package.json.");
  }
  if (!config?.source?.git) {
    warnings.push("Missing source.git in prose.package.json.");
  }
  if (!config?.source?.sha) {
    warnings.push("Missing source.sha in prose.package.json.");
  }
  if ((config?.evals?.length ?? 0) === 0) {
    warnings.push("Package has no linked evals; publish should record no_evals or add eval coverage.");
  }
  if (components.some((component) => component.kind !== "test" && component.effects.length === 0)) {
    warnings.push("One or more components do not declare effects.");
  }
  if (typedPortCoverage < 1) {
    warnings.push("One or more published ports remain untyped.");
  }

  const score = clamp01(
    typedPortCoverage * 0.35 +
      effectDeclarationRatio * 0.25 +
      evalLinkRatio * 0.2 +
      exampleLinkRatio * 0.1 +
      lintHealthRatio * 0.1,
  );

  return {
    score: round2(score),
    component_count: componentCount,
    typed_port_coverage: round2(typedPortCoverage),
    effect_declaration_ratio: round2(effectDeclarationRatio),
    eval_link_ratio: round2(evalLinkRatio),
    example_link_ratio: round2(exampleLinkRatio),
    warnings,
  };
}

async function loadPackageConfig(root: string): Promise<PackageConfig | null> {
  const configPath = resolve(root, "prose.package.json");
  try {
    const source = await readFile(configPath, "utf8");
    return JSON.parse(source) as PackageConfig;
  } catch {
    return null;
  }
}

async function hydratePackageConfig(
  root: string,
  config: PackageConfig | null,
): Promise<PackageConfig | null> {
  if (!config) {
    return null;
  }

  const inferredSource = inferGitSource(root);
  return {
    ...config,
    source: {
      git: config.source?.git?.trim() || inferredSource?.git || undefined,
      sha: config.source?.sha?.trim() || inferredSource?.sha || undefined,
      subpath: config.source?.subpath?.trim() || inferredSource?.subpath || undefined,
    },
  };
}

async function resolvePackageRoot(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  const fallback = info.isDirectory() ? resolved : dirname(resolved);
  let current = fallback;

  while (true) {
    if (existsSync(resolve(current, "prose.package.json"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return fallback;
    }
    current = parent;
  }
}

function inferGitSource(
  root: string,
): { git: string | null; sha: string | null; subpath: string | null } | null {
  const sha = runGit(root, ["rev-parse", "HEAD"]);
  const remote = runGit(root, ["config", "--get", "remote.origin.url"]);
  const gitPrefix = runGit(root, ["rev-parse", "--show-prefix"]);
  if (!sha && !remote && !gitPrefix) {
    return null;
  }

  return {
    git: remote ? normalizeGitRemote(remote) : null,
    sha: sha || null,
    subpath: gitPrefix ? normalizeGitPrefix(gitPrefix) : null,
  };
}

function runGit(cwd: string, args: string[]): string | null {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    return null;
  }
  const value = new TextDecoder().decode(result.stdout).trim();
  return value || null;
}

function normalizeGitRemote(remote: string): string {
  const trimmed = remote.trim().replace(/\.git$/, "");
  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const urlMatch = trimmed.match(/^(?:https?|ssh):\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`;
  }

  return trimmed;
}

function normalizeGitPrefix(prefix: string): string | null {
  const normalized = prefix.replace(/\\/g, "/").replace(/\/+$/, "").trim();
  if (!normalized || normalized === ".") {
    return null;
  }
  return normalized;
}

function summarizeComponent(component: ComponentIR): string | null {
  const firstOutputDescription = component.ports.ensures.find((port) => port.description)?.description;
  if (firstOutputDescription) {
    return firstOutputDescription;
  }
  const firstInputDescription = component.ports.requires.find((port) => port.description)?.description;
  return firstInputDescription || null;
}

function sortDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    const aPath = a.source_span?.path ?? "";
    const bPath = b.source_span?.path ?? "";
    if (aPath !== bPath) {
      return aPath.localeCompare(bPath);
    }
    const aLine = a.source_span?.start_line ?? 0;
    const bLine = b.source_span?.start_line ?? 0;
    if (aLine !== bLine) {
      return aLine - bLine;
    }
    return a.code.localeCompare(b.code);
  });
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
