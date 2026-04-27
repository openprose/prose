import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { collectSourceFiles } from "./files";
import { findSection, parseContractMarkdown } from "./markdown";
import type { ComponentDraft, SectionDraft } from "./markdown";

const CANONICAL_SECTIONS = [
  "services",
  "requires",
  "ensures",
  "runtime",
  "environment",
  "effects",
  "access",
  "strategies",
  "execution",
];

export interface FormatOptions {
  path: string;
  write?: boolean;
}

export interface FormatCheckResult {
  path: string;
  changed: boolean;
}

export async function formatFile(
  path: string,
  options: Omit<FormatOptions, "path"> = {},
): Promise<string> {
  const source = await readFile(resolve(path), "utf8");
  const formatted = formatSource(source, { path });
  if (options.write) {
    await writeFile(resolve(path), formatted, "utf8");
  }
  return formatted;
}

export async function formatPath(
  path: string,
  options: Omit<FormatOptions, "path"> & { check?: boolean } = {},
): Promise<FormatCheckResult[]> {
  const resolved = resolve(path);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    const source = await readFile(resolved, "utf8");
    const formatted = formatSource(source, { path: resolved });
    const changed = source !== formatted;
    if (options.write && changed) {
      await writeFile(resolved, formatted, "utf8");
    }
    return [{ path: normalizePath(resolved), changed }];
  }

  const files = await collectSourceFiles(resolved);
  const results: FormatCheckResult[] = [];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const formatted = formatSource(source, { path: file });
    const changed = source !== formatted;
    if (options.write && changed) {
      await writeFile(file, formatted, "utf8");
    }
    results.push({ path: normalizePath(file), changed });
  }
  return results;
}

export function formatSource(source: string, options: FormatOptions): string {
  const components = parseContractMarkdown(source, normalizePath(options.path), []);
  const lines: string[] = [];

  components.forEach((component, index) => {
    if (index === 0) {
      lines.push("---");
      lines.push(...renderFrontmatter(component, { inline: false }));
      lines.push("---");
    } else {
      lines.push("");
      lines.push(`## ${component.name}`);
      lines.push("---");
      lines.push(...renderFrontmatter(component, { inline: true }));
      lines.push("---");
    }

    const sections = orderedSections(component);
    for (const section of sections) {
      lines.push("");
      lines.push(`### ${section.title}`);
      lines.push("");
      lines.push(...renderSection(section));
    }
  });

  return `${trimTrailingBlankLines(lines).join("\n")}\n`;
}

function renderFrontmatter(
  component: ComponentDraft,
  options: { inline: boolean },
): string[] {
  const entries = new Map<string, unknown>(Object.entries(component.frontmatter));
  entries.set("kind", component.kind);
  if (!options.inline || entries.get("name") !== component.name) {
    entries.set("name", component.name);
  } else {
    entries.delete("name");
  }

  const keys = Array.from(entries.keys()).sort((a, b) => frontmatterRank(a) - frontmatterRank(b) || a.localeCompare(b));
  return keys.map((key) => `${key}: ${renderScalar(entries.get(key))}`);
}

function frontmatterRank(key: string): number {
  if (key === "name") {
    return 0;
  }
  if (key === "kind") {
    return 1;
  }
  return 10;
}

function orderedSections(component: ComponentDraft): SectionDraft[] {
  const known: SectionDraft[] = [];
  const unknown: SectionDraft[] = [];

  for (const key of CANONICAL_SECTIONS) {
    const section = findSection(component, key);
    if (section) {
      known.push(section);
    }
  }

  for (const section of component.sections) {
    if (!CANONICAL_SECTIONS.includes(section.key)) {
      unknown.push(section);
    }
  }

  return [...known, ...unknown];
}

function renderSection(section: SectionDraft): string[] {
  const body = trimBlankLines(section.lines.map((line) => line.text));
  if (section.key === "execution") {
    return renderExecutionBody(body);
  }
  return body.length > 0 ? body : [];
}

function renderExecutionBody(lines: string[]): string[] {
  const trimmed = trimBlankLines(lines);
  if (trimmed.length === 0) {
    return [];
  }

  if (trimmed[0]?.trim().startsWith("```")) {
    return trimmed;
  }

  return ["```prose", ...trimmed, "```"];
}

function renderScalar(value: unknown): string {
  if (typeof value === "boolean" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => renderScalar(item)).join(", ")}]`;
  }
  const stringValue = String(value ?? "");
  return /[\s:[\]'",]/.test(stringValue) ? JSON.stringify(stringValue) : stringValue;
}

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1]?.trim() === "") {
    next.pop();
  }
  return next;
}

function trimBlankLines(lines: string[]): string[] {
  const next = trimTrailingBlankLines(lines);
  while (next.length > 0 && next[0]?.trim() === "") {
    next.shift();
  }
  return next;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function renderFormatCheckText(results: FormatCheckResult[]): string {
  if (results.length === 0) {
    return "No source files found.\n";
  }

  const changed = results.filter((result) => result.changed);
  if (changed.length === 0) {
    return "All checked files are already formatted.\n";
  }

  const lines = changed.map((result) => `Needs formatting: ${result.path}`);
  return `${lines.join("\n")}\n`;
}
