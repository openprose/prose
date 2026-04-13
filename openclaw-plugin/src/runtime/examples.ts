/**
 * Example program listing and display.
 *
 * Reads from the vendored assets/openprose/examples/ directory.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk/openprose";
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function assetsDir(): string {
  // Resolve relative to compiled output: dist/runtime/examples.js → ../../assets
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "..", "..", "assets", "openprose");
}

function examplesDir(): string {
  return join(assetsDir(), "examples");
}

interface ExampleEntry {
  number: string;
  name: string;
  filename: string;
  isDirectory: boolean;
}

async function scanExamples(): Promise<ExampleEntry[]> {
  const dir = examplesDir();
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  return entries
    .filter((f) => f.match(/^\d+/))
    .sort()
    .map((filename) => {
      const match = filename.match(/^(\d+)-(.+?)(?:\.(?:md|prose))?$/);
      const isDir = !filename.includes(".");
      return {
        number: match?.[1] ?? "",
        name: match?.[2]?.replace(/-/g, " ") ?? filename,
        filename,
        isDirectory: isDir,
      };
    });
}

export async function listExamples(
  _api: OpenClawPluginApi,
): Promise<string> {
  const examples = await scanExamples();

  if (examples.length === 0) {
    return "No examples found. Run `openclaw prose status` to check plugin installation.";
  }

  const lines = ["# OpenProse Examples", ""];

  for (const ex of examples) {
    const marker = ex.isDirectory ? " (multi-file)" : "";
    lines.push(`- **${ex.number}** — ${ex.name}${marker}`);
  }

  lines.push("");
  lines.push(
    "Run `/prose examples <number>` to view a specific example.",
  );

  return lines.join("\n");
}

export async function showExample(
  _api: OpenClawPluginApi,
  query: string,
): Promise<string> {
  const examples = await scanExamples();
  const q = query.trim().toLowerCase();

  // Match by number, filename, or keyword
  const match = examples.find(
    (ex) =>
      ex.number === q ||
      ex.filename === q ||
      ex.filename.startsWith(q) ||
      ex.name.includes(q),
  );

  if (!match) {
    return `No example matching "${query}". Run \`/prose examples\` to see all available.`;
  }

  if (match.isDirectory) {
    // Multi-file example — list contents
    const dir = join(examplesDir(), match.filename);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return `Example directory ${match.filename}/ exists but cannot be read.`;
    }

    const lines = [
      `# Example ${match.number}: ${match.name}`,
      "",
      "Multi-file program:",
      "",
    ];
    for (const f of files.sort()) {
      lines.push(`- \`${match.filename}/${f}\``);
    }

    // Try to read the main file
    for (const candidate of ["program.md", "main.md", "index.md"]) {
      try {
        const content = await readFile(join(dir, candidate), "utf-8");
        lines.push("", `## ${candidate}`, "", "```markdown", content.trimEnd(), "```");
        break;
      } catch {
        continue;
      }
    }

    return lines.join("\n");
  }

  // Single file
  const filepath = join(examplesDir(), match.filename);
  try {
    const content = await readFile(filepath, "utf-8");
    return [
      `# Example ${match.number}: ${match.name}`,
      "",
      "```markdown",
      content.trimEnd(),
      "```",
    ].join("\n");
  } catch {
    return `Could not read example file: ${match.filename}`;
  }
}
