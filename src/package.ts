import { readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { compileFile } from "./compiler";
import { collectSourceFiles } from "./files";
import { lintFile } from "./lint";
import { buildRegistryRef } from "./registry";
import type {
  ComponentIR,
  Diagnostic,
  HostedRuntimeMetadata,
  PackageComponentMetadata,
  PackageMetadata,
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
  };
  schemas?: string[];
  evals?: string[];
  examples?: string[];
  hosted?: HostedRuntimeMetadata;
}

export async function packagePath(path: string): Promise<PackageMetadata> {
  const root = await resolvePackageRoot(path);
  const config = await loadPackageConfig(root);
  const files = await collectSourceFiles(root);
  const components: PackageComponentMetadata[] = [];
  const diagnostics: Diagnostic[] = [];
  const dependencyMap = new Map<string, ProseIR["package"]["dependencies"][number]>();
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
    if (!lintDiagnostics.some((diagnostic) => diagnostic.severity !== "info")) {
      lintCleanComponents += ir.components.length;
    }

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
      const allPorts = [...component.ports.requires, ...component.ports.ensures];
      const typedCount = allPorts.filter((port) => port.type !== "Any").length;
      typedPorts += typedCount;
      totalPorts += allPorts.length;

      const componentMetadata = buildComponentMetadata({
        root,
        file,
        ir,
        component,
        packageExamples: config?.examples ?? [],
        packageEvals: config?.evals ?? [],
      });
      components.push(componentMetadata);

      if (component.effects.length > 0) {
        componentsWithEffects += 1;
      }
      if (componentMetadata.examples.length > 0) {
        componentsWithExamples += 1;
      }
      if (componentMetadata.evals.length > 0) {
        componentsWithEvals += 1;
      }
    }
  }

  components.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  const manifestName = config?.name?.trim() || basename(root);
  const catalog = config?.registry?.catalog?.trim() || "openprose";
  const registryRef = config?.version
    ? buildRegistryRef({
        catalog,
        package_name: manifestName,
        version: config.version.trim(),
      })
    : null;
  const quality = buildQualitySummary({
    componentCount: components.length,
    typedPorts,
    totalPorts,
    componentsWithEffects,
    componentsWithExamples,
    componentsWithEvals,
    lintCleanComponents,
    components,
    config,
  });

  return {
    package_version: "0.1",
    root: normalizePath(root),
    manifest: {
      name: manifestName,
      version: config?.version?.trim() || null,
      catalog,
      registry_ref: registryRef,
      description: config?.description?.trim() || null,
      license: config?.license?.trim() || null,
      source: {
        git: config?.source?.git?.trim() || null,
        sha: config?.source?.sha?.trim() || null,
      },
      dependencies: Array.from(dependencyMap.values()).sort((a, b) =>
        a.package.localeCompare(b.package) || a.sha.localeCompare(b.sha),
      ),
      schemas: [...(config?.schemas ?? [])].sort(),
      evals: [...(config?.evals ?? [])].sort(),
      examples: [...(config?.examples ?? [])].sort(),
      no_evals: (config?.evals?.length ?? 0) === 0,
      hosted: config?.hosted ?? null,
    },
    components,
    diagnostics: sortDiagnostics(diagnostics),
    quality,
  };
}

export function renderPackageText(metadata: PackageMetadata): string {
  const lines = [
    `Package: ${metadata.manifest.name}${metadata.manifest.version ? `@${metadata.manifest.version}` : ""}`,
    `Root: ${metadata.root}`,
    `Components: ${metadata.components.length}`,
    `Quality score: ${metadata.quality.score.toFixed(2)}`,
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
      if (component.warnings.length > 0) {
        for (const warning of component.warnings) {
          lines.push(`    warning: ${warning}`);
        }
      }
    }
  }

  return `${lines.join("\n")}\n`;
}

function buildComponentMetadata(options: {
  root: string;
  file: string;
  ir: ProseIR;
  component: ComponentIR;
  packageExamples: string[];
  packageEvals: string[];
}): PackageComponentMetadata {
  const { root, file, ir, component, packageExamples, packageEvals } = options;
  const allPorts = [...component.ports.requires, ...component.ports.ensures];
  const typedCount = allPorts.filter((port) => port.type !== "Any").length;
  const typedCoverage = allPorts.length === 0 ? 1 : typedCount / allPorts.length;
  const hasEffects = component.effects.length > 0;
  const hasExamples = packageExamples.length > 0;
  const hasEvals = packageEvals.length > 0;
  const warnings: string[] = [];

  if (typedCoverage < 1) {
    warnings.push("Component has untyped ports; add explicit type names for registry search and composition.");
  }
  if (!hasEffects) {
    warnings.push("Component does not declare effects; add explicit pure/read_external/etc.");
  }
  if (!hasEvals) {
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
    summary: summarizeComponent(component),
    inputs: component.ports.requires.map((port) => ({ name: port.name, type: port.type })),
    outputs: component.ports.ensures.map((port) => ({ name: port.name, type: port.type })),
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
  if (components.some((component) => component.effects.length === 0)) {
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

async function resolvePackageRoot(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  return info.isDirectory() ? resolved : dirname(resolved);
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
