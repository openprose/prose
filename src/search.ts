import { readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { packagePath } from "./package";
import type { CatalogSearchEntry, CatalogSearchResult, ComponentKind } from "./types";

const IGNORED_DIRS = new Set([".git", "node_modules", ".prose", ".deps"]);

export interface SearchCatalogOptions {
  type?: string[];
  effect?: string[];
  kind?: ComponentKind | null;
  minQuality?: number | null;
}

export async function searchCatalog(
  path: string,
  options: SearchCatalogOptions = {},
): Promise<CatalogSearchResult> {
  const root = await resolveSearchRoot(path);
  const packageRoots = await discoverPackageRoots(root);
  const results: CatalogSearchEntry[] = [];

  for (const packageRoot of packageRoots) {
    const metadata = await packagePath(packageRoot);
    for (const component of metadata.components) {
      const entry: CatalogSearchEntry = {
        package_name: metadata.manifest.name,
        package_version: metadata.manifest.version,
        package_root: metadata.root,
        component_name: component.name,
        component_kind: component.kind,
        component_path: component.path,
        summary: component.summary,
        inputs: component.inputs,
        outputs: component.outputs,
        effects: component.effects,
        quality_score: component.quality_score,
      };
      if (!matches(entry, options)) {
        continue;
      }
      results.push(entry);
    }
  }

  results.sort((a, b) => {
    if (b.quality_score !== a.quality_score) {
      return b.quality_score - a.quality_score;
    }
    return (
      a.package_name.localeCompare(b.package_name) ||
      a.component_name.localeCompare(b.component_name)
    );
  });

  return {
    catalog_search_version: "0.1",
    root: normalizePath(root),
    package_count: packageRoots.length,
    filters: {
      type: [...(options.type ?? [])].sort(),
      effect: [...(options.effect ?? [])].sort(),
      kind: options.kind ?? null,
      min_quality: options.minQuality ?? null,
    },
    results,
  };
}

export function renderCatalogSearchText(result: CatalogSearchResult): string {
  const lines = [
    `Catalog search: ${result.results.length} result(s) across ${result.package_count} package(s)`,
  ];

  for (const entry of result.results) {
    lines.push(
      `- ${entry.package_name}${entry.package_version ? `@${entry.package_version}` : ""} :: ${entry.component_name} (${entry.component_kind}) score=${entry.quality_score.toFixed(2)}`,
    );
    if (entry.summary) {
      lines.push(`  ${entry.summary}`);
    }
    if (entry.inputs.length > 0) {
      lines.push(
        `  inputs: ${entry.inputs.map((port) => `${port.name}:${port.type}`).join(", ")}`,
      );
    }
    if (entry.outputs.length > 0) {
      lines.push(
        `  outputs: ${entry.outputs.map((port) => `${port.name}:${port.type}`).join(", ")}`,
      );
    }
    lines.push(
      `  effects: ${entry.effects.length > 0 ? entry.effects.join(", ") : "(none declared)"}`,
    );
  }

  return `${lines.join("\n")}\n`;
}

async function discoverPackageRoots(path: string): Promise<string[]> {
  const roots: string[] = [];
  await walk(path, roots);
  return roots.sort();
}

async function walk(directory: string, roots: string[]): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  const hasConfig = entries.some((entry) => entry.isFile() && entry.name === "prose.package.json");
  const hasLocalSource = entries.some((entry) => entry.isFile() && entry.name.endsWith(".prose.md"));

  if (hasConfig || hasLocalSource) {
    roots.push(directory);
    return;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) {
      continue;
    }
    await walk(resolve(directory, entry.name), roots);
  }
}

async function resolveSearchRoot(path: string): Promise<string> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  return info.isDirectory() ? resolved : dirname(resolved);
}

function matches(
  component: CatalogSearchEntry,
  options: SearchCatalogOptions,
): boolean {
  if (options.kind && component.component_kind !== options.kind) {
    return false;
  }
  if (
    options.minQuality !== undefined &&
    options.minQuality !== null &&
    component.quality_score < options.minQuality
  ) {
    return false;
  }
  if ((options.effect?.length ?? 0) > 0) {
    for (const effect of options.effect ?? []) {
      if (!component.effects.includes(effect)) {
        return false;
      }
    }
  }
  if ((options.type?.length ?? 0) > 0) {
    const componentTypes = new Set([
      ...component.inputs.map((port) => port.type),
      ...component.outputs.map((port) => port.type),
    ]);
    for (const type of options.type ?? []) {
      if (!componentTypes.has(type)) {
        return false;
      }
    }
  }
  return true;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
