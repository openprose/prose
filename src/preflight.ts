import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compileFile, compileSource } from "./compiler";
import { collectSourceFiles } from "./files";
import { sha256 } from "./hash";
import { findNearestLockfileSync } from "./lockfile";
import type {
  ComponentIR,
  Diagnostic,
  PreflightDependencyCheck,
  PreflightEnvironmentCheck,
  PreflightResult,
} from "./types";

export interface PreflightOptions {
  environment?: Record<string, string | undefined>;
  path: string;
}

interface ComponentEntry {
  component: ComponentIR;
  dependencies: PreflightDependencyCheck[];
  path: string;
}

export async function preflightPath(
  path: string,
  options: Omit<PreflightOptions, "path"> = {},
): Promise<PreflightResult> {
  const target = resolve(path);
  const packageRoot = await resolvePackageRoot(target);
  const scopeFiles = await collectSourceFiles(packageRoot, {
    excludeNestedPackageRoots: true,
  });
  const entries = await buildComponentEntries(scopeFiles);
  const availableComponentNames = entries.map((entry) => entry.component.name);
  const source = await readFile(target, "utf8");
  const ir = compileSource(source, {
    path: target,
    availableComponentNames,
  });
  const main = ir.components.find((component) => component.kind === "program") ?? null;
  const components = main ? collectReferencedComponents(main, entries) : [];
  const diagnostics = [...ir.diagnostics];
  const env = options.environment ?? process.env;

  if (!main) {
    diagnostics.push({
      severity: "error",
      code: "preflight_not_program",
      message: "Preflight currently targets program `.prose.md` files.",
      source_span: ir.components[0]?.source.span,
    });
  }

  const environmentChecks = collectEnvironmentChecks(components, env);
  const dependencyChecks = collectDependencyChecks(components, target);
  const missing = [
    ...environmentChecks
      .filter((check) => check.status === "missing")
      .map((check) => `Missing required environment variable '${check.name}'.`),
    ...dependencyChecks
      .filter((check) => !check.pinned)
      .map((check) => `Dependency '${check.package}' is not pinned in prose.lock.`),
    ...dependencyChecks
      .filter((check) => check.pinned && !check.installed)
      .map((check) => `Dependency '${check.package}' is pinned but not installed in .deps/.`),
    ...diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.message),
  ];
  const warnings = diagnostics
    .filter((diagnostic) => diagnostic.severity === "warning")
    .map((diagnostic) => diagnostic.message);

  return {
    preflight_version: "0.1",
    target,
    package_root: packageRoot.replace(/\\/g, "/"),
    component_refs: components.map((component) => component.component.name).sort(),
    status: missing.length === 0 ? "pass" : "fail",
    environment: environmentChecks,
    dependencies: dependencyChecks,
    diagnostics,
    missing,
    warnings,
  };
}

export function renderPreflightText(result: PreflightResult): string {
  const lines: string[] = [];
  lines.push(`Preflight: ${result.status.toUpperCase()}`);
  lines.push(`Target: ${result.target}`);
  lines.push(`Package root: ${result.package_root}`);
  lines.push(
    `Components: ${result.component_refs.length > 0 ? result.component_refs.join(", ") : "(none)"}`,
  );

  lines.push("");
  lines.push("Environment:");
  if (result.environment.length === 0) {
    lines.push("- (none)");
  } else {
    for (const check of result.environment) {
      lines.push(
        `- ${check.name}: ${check.status}${check.declared_by.length ? ` (declared by ${check.declared_by.join(", ")})` : ""}`,
      );
    }
  }

  lines.push("");
  lines.push("Dependencies:");
  if (result.dependencies.length === 0) {
    lines.push("- (none)");
  } else {
    for (const check of result.dependencies) {
      lines.push(
        `- ${check.package}@${check.sha || "unresolved"}: ${check.installed ? "installed" : "missing"}${check.lockfile_path ? ` via ${check.lockfile_path}` : ""}`,
      );
    }
  }

  if (result.missing.length > 0) {
    lines.push("");
    lines.push("Missing:");
    for (const item of result.missing) {
      lines.push(`- ${item}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("Warnings:");
    for (const item of result.warnings) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function buildComponentEntries(files: string[]): Promise<ComponentEntry[]> {
  const entries: ComponentEntry[] = [];

  for (const file of files) {
    const ir = await compileFile(file);
    const dependencies = ir.package.dependencies.map((dependency) => ({
      package: dependency.package,
      sha: dependency.sha,
      pinned: dependency.sha.length > 0,
      installed: false,
      install_dir: null,
      lockfile_path: dependency.lock_ref,
      refs: [...dependency.refs],
    }));

    for (const component of ir.components) {
      entries.push({
        component,
        dependencies,
        path: file,
      });
    }
  }

  return entries;
}

function collectReferencedComponents(
  root: ComponentIR,
  entries: ComponentEntry[],
): ComponentEntry[] {
  const byName = new Map(entries.map((entry) => [entry.component.name, entry]));
  const selected: ComponentEntry[] = [];
  const queue = [root.name];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const name = queue.shift();
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);

    const entry = byName.get(name);
    if (!entry) {
      continue;
    }
    selected.push(entry);

    for (const service of entry.component.services) {
      if (byName.has(service.name)) {
        queue.push(service.name);
      }
    }
  }

  return selected;
}

function collectEnvironmentChecks(
  entries: ComponentEntry[],
  environment: Record<string, string | undefined>,
): PreflightEnvironmentCheck[] {
  const checks = new Map<string, PreflightEnvironmentCheck>();

  for (const entry of entries) {
    for (const variable of entry.component.environment) {
      const existing = checks.get(variable.name);
      if (existing) {
        if (!existing.declared_by.includes(entry.component.name)) {
          existing.declared_by.push(entry.component.name);
          existing.declared_by.sort();
        }
        continue;
      }

      checks.set(variable.name, {
        name: variable.name,
        status: Object.prototype.hasOwnProperty.call(environment, variable.name)
          ? "set"
          : "missing",
        declared_by: [entry.component.name],
      });
    }
  }

  return Array.from(checks.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function collectDependencyChecks(
  entries: ComponentEntry[],
  targetPath: string,
): PreflightDependencyCheck[] {
  const checks = new Map<string, PreflightDependencyCheck>();
  const lockfile = findNearestLockfileSync(targetPath);
  const workspaceRoot = lockfile ? dirname(lockfile.path) : dirname(resolve(targetPath));
  const depsRoot = resolve(workspaceRoot, ".deps");

  for (const entry of entries) {
    for (const dependency of entry.dependencies) {
      const existing = checks.get(dependency.package);
      if (!existing) {
        const installDir = resolveInstallDir(dependency.package, depsRoot);
        checks.set(dependency.package, {
          package: dependency.package,
          sha: dependency.sha,
          pinned: dependency.pinned,
          installed: dependency.pinned ? existsSync(installDir) : false,
          install_dir: dependency.pinned ? normalizePath(installDir) : null,
          lockfile_path: lockfile ? normalizePath(lockfile.path) : dependency.lockfile_path,
          refs: [...dependency.refs].sort(),
        });
        continue;
      }

      if (!existing.sha && dependency.sha) {
        existing.sha = dependency.sha;
      }
      existing.pinned = existing.pinned || dependency.pinned;
      existing.installed =
        existing.installed ||
        (dependency.pinned
          ? existsSync(resolveInstallDir(dependency.package, depsRoot))
          : false);
      existing.refs = Array.from(new Set([...existing.refs, ...dependency.refs])).sort();
    }
  }

  return Array.from(checks.values()).sort((a, b) => a.package.localeCompare(b.package));
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

function resolveInstallDir(sourceGit: string, depsRoot: string): string {
  const hostRef = parseHostSource(sourceGit);
  if (hostRef) {
    return resolve(depsRoot, hostRef.host, hostRef.owner, hostRef.repo);
  }

  const slug = sourceGit
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]+/g, "-") || "source";
  return resolve(depsRoot, "_sources", `${slug}-${sha256(sourceGit).slice(0, 8)}`);
}

function parseHostSource(sourceGit: string): { host: string; owner: string; repo: string } | null {
  const trimmed = sourceGit.trim().replace(/\.git$/, "");
  if (/^[^/]+\.[^/]+\/[^/]+\/[^/]+$/.test(trimmed)) {
    const [host, owner, repo] = trimmed.split("/");
    return { host, owner, repo };
  }
  return null;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
