import { existsSync } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { compileFile } from "./compiler";
import { collectSourceFiles } from "./files";
import { sha256 } from "./hash";
import { loadLockfile, writeLockfile } from "./lockfile";
import { packagePath } from "./package";
import { parseRegistryRef } from "./registry";
import type { InstallResult, PackageMetadata, WorkspaceInstallResult } from "./types";

export interface InstallOptions {
  catalogRoot?: string;
  depsRoot?: string;
  refresh?: boolean;
  sourceOverrides?: Record<string, string>;
  workspaceRoot?: string;
}

export async function installRegistryRef(
  ref: string,
  options: InstallOptions = {},
): Promise<InstallResult> {
  const parsed = parseRegistryRef(ref);
  if (!parsed) {
    throw new Error(`Invalid registry ref: ${ref}`);
  }

  const workspaceRoot = resolve(options.workspaceRoot ?? process.cwd());
  const catalogRoot = resolve(options.catalogRoot ?? workspaceRoot);
  const depsRoot = resolve(options.depsRoot ?? join(workspaceRoot, ".deps"));
  const metadata = await resolvePackageFromCatalog(parsed.catalog, parsed.package_name, parsed.version, catalogRoot);

  if (!metadata.manifest.source.git || !metadata.manifest.source.sha) {
    throw new Error(
      `Package '${metadata.manifest.name}' is missing source.git or source.sha in prose.package.json.`,
    );
  }

  const component = parsed.component
    ? metadata.components.find((entry) => entry.name === parsed.component)
    : null;
  if (parsed.component && !component) {
    throw new Error(
      `Component '${parsed.component}' was not found in package '${metadata.manifest.name}@${metadata.manifest.version}'.`,
    );
  }

  const installDir = resolveInstallDir(metadata.manifest.source.git, depsRoot);
  await mkdir(dirname(installDir), { recursive: true });
  await ensureGitCheckout(
    metadata.manifest.source.git,
    metadata.manifest.source.sha,
    installDir,
    options.sourceOverrides ?? {},
  );

  const lockfile = await loadLockfile(join(workspaceRoot, "prose.lock"));
  lockfile.registry_pins.set(parsed.ref, {
    ref: parsed.ref,
    package: normalizeSourcePackage(metadata.manifest.source.git),
    sha: metadata.manifest.source.sha,
  });
  lockfile.source_pins.set(
    normalizeSourcePackage(metadata.manifest.source.git),
    metadata.manifest.source.sha,
  );
  await writeLockfile(lockfile);

  return {
    install_version: "0.1",
    registry_ref: parsed.ref,
    package_name: metadata.manifest.name,
    package_version: metadata.manifest.version ?? parsed.version,
    source_git: metadata.manifest.source.git,
    source_sha: metadata.manifest.source.sha,
    install_dir: normalizePath(installDir),
    component_file: component
      ? normalizePath(
          join(installDir, metadata.manifest.source.subpath ?? "", component.path),
        )
      : null,
    lockfile_path: normalizePath(lockfile.path),
  };
}

export async function installWorkspaceDependencies(
  path: string,
  options: InstallOptions = {},
): Promise<WorkspaceInstallResult> {
  const workspaceRoot = resolve(options.workspaceRoot ?? path);
  const depsRoot = resolve(options.depsRoot ?? join(workspaceRoot, ".deps"));
  const lockfile = await loadLockfile(join(workspaceRoot, "prose.lock"));
  const sourceOverrides = options.sourceOverrides ?? {};
  const queue = Array.from(await scanDependencyPackages(workspaceRoot));
  const seen = new Set<string>();
  const installed = new Map<string, { package: string; sha: string; install_dir: string }>();

  while (queue.length > 0) {
    const packageRef = queue.shift();
    if (!packageRef || seen.has(packageRef)) {
      continue;
    }
    seen.add(packageRef);

    const installDir = resolveInstallDir(packageRef, depsRoot);
    let sha = options.refresh ? null : lockfile.source_pins.get(packageRef) ?? null;
    await mkdir(dirname(installDir), { recursive: true });

    if (!sha) {
      const cloneSource = resolveSourceForPackage(packageRef, sourceOverrides);
      if (!existsSync(installDir)) {
        runGit(["clone", cloneSource, installDir], dirname(installDir));
      } else {
        runGit(["fetch", "--all", "--tags"], installDir);
      }
      sha = options.refresh
        ? resolveLatestSourceSha(packageRef, sourceOverrides, installDir)
        : runGit(["rev-parse", "HEAD"], installDir).trim();
      lockfile.source_pins.set(packageRef, sha);
    }

    await ensureGitCheckout(packageRef, sha, installDir, sourceOverrides);
    installed.set(packageRef, {
      package: packageRef,
      sha,
      install_dir: normalizePath(installDir),
    });

    for (const nested of await scanDependencyPackages(installDir)) {
      if (!seen.has(nested)) {
        queue.push(nested);
      }
    }
  }

  await writeLockfile(lockfile);

  return {
    install_version: "0.1",
    workspace_root: normalizePath(workspaceRoot),
    deps_root: normalizePath(depsRoot),
    lockfile_path: normalizePath(lockfile.path),
    installed_packages: Array.from(installed.values()).sort((a, b) =>
      a.package.localeCompare(b.package),
    ),
  };
}

async function resolvePackageFromCatalog(
  catalog: string,
  packageName: string,
  version: string,
  root: string,
): Promise<PackageMetadata> {
  const packageRoots = await discoverPackageRoots(root);

  for (const packageRoot of packageRoots) {
    const metadata = await packagePath(packageRoot);
    if (
      metadata.manifest.catalog === catalog &&
      metadata.manifest.name === packageName &&
      metadata.manifest.version === version
    ) {
      return metadata;
    }
  }

  throw new Error(
    `Registry ref '${catalog}/${packageName}@${version}' was not found under ${normalizePath(root)}.`,
  );
}

async function discoverPackageRoots(path: string): Promise<string[]> {
  if (!existsSync(path)) {
    return [];
  }
  const entries = await readdir(path, { withFileTypes: true });
  const roots: string[] = [];

  const hasConfig = entries.some((entry) => entry.isFile() && entry.name === "prose.package.json");
  const hasSource = entries.some((entry) => entry.isFile() && entry.name.endsWith(".prose.md"));
  if (hasConfig || hasSource) {
    roots.push(path);
    return roots;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name === ".git" || entry.name === ".deps" || entry.name === ".prose" || entry.name === "node_modules") {
      continue;
    }
    roots.push(...(await discoverPackageRoots(resolve(path, entry.name))));
  }

  return roots;
}

async function ensureGitCheckout(
  sourceGit: string,
  sha: string,
  installDir: string,
  sourceOverrides: Record<string, string>,
): Promise<void> {
  if (!existsSync(installDir)) {
    runGit(
      ["clone", resolveCloneSource(resolveSourceForPackage(sourceGit, sourceOverrides)), installDir],
      dirname(installDir),
    );
  } else {
    runGit(["fetch", "--all", "--tags"], installDir);
  }
  runGit(["checkout", sha], installDir);
}

function resolveInstallDir(sourceGit: string, depsRoot: string): string {
  const hostRef = parseHostSource(sourceGit);
  if (hostRef) {
    return resolve(depsRoot, hostRef.host, hostRef.owner, hostRef.repo);
  }

  const slug = basenameSafe(sourceGit);
  return resolve(depsRoot, "_sources", `${slug}-${sha256(sourceGit).slice(0, 8)}`);
}

function normalizeSourcePackage(sourceGit: string): string {
  const hostRef = parseHostSource(sourceGit);
  if (hostRef) {
    return `${hostRef.host}/${hostRef.owner}/${hostRef.repo}`;
  }
  return normalizePath(sourceGit);
}

async function scanDependencyPackages(root: string): Promise<Set<string>> {
  const files = await collectSourceFiles(root, { includeLegacyMarkdown: true });
  const packages = new Set<string>();

  for (const file of files) {
    if (!(await looksLikeExecutableSource(file))) {
      continue;
    }
    const ir = await compileFile(file);
    for (const dependency of ir.package.dependencies) {
      if (dependency.package) {
        packages.add(dependency.package);
      }
    }
  }

  return packages;
}

async function looksLikeExecutableSource(path: string): Promise<boolean> {
  if (path.endsWith(".prose.md")) {
    return true;
  }

  const source = await readFile(path, "utf8");
  const header = source.slice(0, 400);
  return /^---\s*$/m.test(header) && /^kind:\s*(program|service|composite|test)\s*$/m.test(header);
}

function parseHostSource(sourceGit: string): { host: string; owner: string; repo: string } | null {
  const trimmed = sourceGit.trim().replace(/\.git$/, "");
  if (/^[^/]+\.[^/]+\/[^/]+\/[^/]+$/.test(trimmed)) {
    const [host, owner, repo] = trimmed.split("/");
    return { host, owner, repo };
  }
  return null;
}

function resolveCloneSource(sourceGit: string): string {
  const trimmed = sourceGit.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("ssh://") ||
    trimmed.startsWith("git@") ||
    trimmed.startsWith("file://")
  ) {
    return trimmed;
  }

  const hostRef = parseHostSource(trimmed);
  if (hostRef) {
    return `https://${hostRef.host}/${hostRef.owner}/${hostRef.repo}.git`;
  }

  return resolve(trimmed);
}

function resolveSourceForPackage(
  sourceGit: string,
  sourceOverrides: Record<string, string>,
): string {
  return sourceOverrides[sourceGit] ?? sourceGit;
}

function resolveLatestSourceSha(
  sourceGit: string,
  sourceOverrides: Record<string, string>,
  installDir: string,
): string {
  const cloneSource = resolveCloneSource(resolveSourceForPackage(sourceGit, sourceOverrides));
  const output = runGit(["ls-remote", cloneSource, "HEAD"], dirname(installDir));
  const sha = output.split(/\s+/)[0]?.trim();
  if (!sha) {
    throw new Error(`Could not resolve HEAD for ${sourceGit}.`);
  }
  return sha;
}

function runGit(args: string[], cwd: string): string {
  const result = Bun.spawnSync(["git", ...args], {
    cwd,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr).trim();
    throw new Error(stderr || `git ${args.join(" ")} failed`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

function basenameSafe(value: string): string {
  return value
    .split(/[\\/]/)
    .filter(Boolean)
    .pop()
    ?.replace(/[^A-Za-z0-9._-]+/g, "-") || "source";
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
