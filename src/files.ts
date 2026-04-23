import { readdir, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", ".prose", ".deps"]);

export async function collectSourceFiles(
  path: string,
  options: { includeLegacyMarkdown?: boolean } = {},
): Promise<string[]> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    return [resolved];
  }

  const files: string[] = [];
  await walk(resolved, files, options);
  return files.sort();
}

async function walk(
  directory: string,
  files: string[],
  options: { includeLegacyMarkdown?: boolean },
): Promise<void> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        await walk(fullPath, files, options);
      }
      continue;
    }

    if (matchesSourceFile(entry.name, options)) {
      files.push(fullPath);
    }
  }
}

function matchesSourceFile(
  name: string,
  options: { includeLegacyMarkdown?: boolean },
): boolean {
  if (name.endsWith(".prose.md")) {
    return true;
  }

  if (options.includeLegacyMarkdown) {
    return name.endsWith(".md") && !name.endsWith(".prose.md");
  }

  return false;
}

export function isDirectoryPath(path: string): boolean {
  return !basename(path).includes(".");
}
