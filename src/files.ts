import { readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", ".prose", ".deps"]);

export async function collectSourceFiles(
  path: string,
  options: {
    excludeNestedPackageRoots?: boolean;
  } = {},
): Promise<string[]> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    return [resolved];
  }

  const files: string[] = [];
  await walk(resolved, files, {
    ...options,
    root: resolved,
  });
  return files.sort();
}

async function walk(
  directory: string,
  files: string[],
  options: {
    excludeNestedPackageRoots?: boolean;
    root: string;
  },
): Promise<void> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        if (
          options.excludeNestedPackageRoots &&
          fullPath !== options.root &&
          (await hasPackageConfig(fullPath))
        ) {
          continue;
        }
        await walk(fullPath, files, options);
      }
      continue;
    }

    if (entry.name.endsWith(".prose.md")) {
      files.push(fullPath);
    }
  }
}

export function isDirectoryPath(path: string): boolean {
  return !basename(path).includes(".");
}

async function hasPackageConfig(path: string): Promise<boolean> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && entry.name === "prose.package.json");
}
