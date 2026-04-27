import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { compileSource } from "./compiler";
import { collectSourceFiles } from "./files";
import { parseContractMarkdown } from "./markdown";
import type { ComponentDraft } from "./markdown";
import type { Diagnostic } from "./types";

const CANONICAL_SECTION_ORDER = new Map(
  [
    "services",
    "requires",
    "ensures",
    "runtime",
    "environment",
    "effects",
    "access",
    "strategies",
    "execution",
  ].map((key, index) => [key, index]),
);

export interface LintOptions {
  path: string;
  availableComponentNames?: Iterable<string>;
}

export async function lintFile(path: string): Promise<Diagnostic[]> {
  const source = await readFile(resolve(path), "utf8");
  return lintSource(source, { path });
}

export async function lintPath(path: string): Promise<Map<string, Diagnostic[]>> {
  const files = await collectSourceFiles(path);
  const report = new Map<string, Diagnostic[]>();
  const scopeRoot = resolvePackageScopeRoot(path);
  const scopeFiles =
    normalizePath(scopeRoot) === normalizePath(resolve(path))
      ? files
      : await collectSourceFiles(scopeRoot);
  const sources = new Map<string, string>();
  const draftsByPath = new Map<string, ComponentDraft[]>();
  const availableComponentNames = new Set<string>();

  for (const file of scopeFiles) {
    const normalized = normalizePath(file);
    const source = await readFile(resolve(file), "utf8");
    sources.set(normalized, source);

    const drafts = parseContractMarkdown(source, normalized, []);
    draftsByPath.set(normalized, drafts);
    if (!isLintableSource(normalized, source, drafts)) {
      continue;
    }
    for (const draft of drafts) {
      availableComponentNames.add(draft.name);
    }
  }

  for (const file of files) {
    const normalized = normalizePath(file);
    const source = sources.get(normalized) ?? "";
    const drafts = draftsByPath.get(normalized) ?? [];
    if (!isLintableSource(normalized, source, drafts)) {
      continue;
    }
    report.set(
      normalized,
      lintSource(source, {
        path: normalized,
        availableComponentNames,
      }),
    );
  }

  return report;
}

export function lintSource(source: string, options: LintOptions): Diagnostic[] {
  const ir = compileSource(source, {
    path: options.path,
    availableComponentNames: options.availableComponentNames,
  });
  const diagnostics = [...ir.diagnostics];
  const drafts = parseContractMarkdown(source, normalizePath(options.path), []);

  diagnostics.push(...canonicalSourceDiagnostics(options.path));
  diagnostics.push(...sectionDiagnostics(drafts));

  return sortDiagnostics(diagnostics);
}

function isLintableSource(
  path: string,
  source: string,
  drafts: ComponentDraft[],
): boolean {
  if (path.endsWith(".prose.md")) {
    return true;
  }
  if (path.endsWith("/README.md") || path.endsWith("\\README.md")) {
    return false;
  }

  const trimmed = source.trimStart();
  if (trimmed.startsWith("---")) {
    return true;
  }

  return drafts.some((draft) => Object.keys(draft.frontmatter).length > 0);
}

export function renderLintText(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) {
    return "No lint diagnostics.\n";
  }

  const lines = diagnostics.map((diagnostic) => {
    const location = diagnostic.source_span
      ? `${diagnostic.source_span.path}:${diagnostic.source_span.start_line}`
      : "(unknown)";
    return `${location} [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`;
  });
  return `${lines.join("\n")}\n`;
}

export function renderLintReportText(report: Map<string, Diagnostic[]>): string {
  const files = Array.from(report.keys()).sort();
  if (files.length === 0) {
    return "No source files found.\n";
  }

  const lines: string[] = [];
  for (const file of files) {
    const diagnostics = report.get(file) ?? [];
    lines.push(`${file}: ${diagnostics.length} diagnostic${diagnostics.length === 1 ? "" : "s"}`);
    for (const diagnostic of diagnostics) {
      const line = diagnostic.source_span?.start_line;
      const location = line ? `${file}:${line}` : file;
      lines.push(`  - ${location} [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function canonicalSourceDiagnostics(path: string): Diagnostic[] {
  if (path.endsWith(".prose.md")) {
    return [];
  }

  return [
    {
      severity: "warning",
      code: "non_canonical_extension",
      message: "Executable OpenProse source should use the .prose.md extension.",
    },
  ];
}

function sectionDiagnostics(components: ComponentDraft[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const component of components) {
    diagnostics.push(...duplicateSectionDiagnostics(component));
    diagnostics.push(...sectionOrderDiagnostics(component));
  }

  return diagnostics;
}

function duplicateSectionDiagnostics(component: ComponentDraft): Diagnostic[] {
  const seen = new Map<string, ComponentDraft["sections"][number]>();
  const diagnostics: Diagnostic[] = [];

  for (const section of component.sections) {
    const existing = seen.get(section.key);
    if (existing) {
      diagnostics.push({
        severity: "warning",
        code: "duplicate_section",
        message: `Section '${section.title}' appears more than once in '${component.name}'.`,
        source_span: section.span,
      });
      continue;
    }
    seen.set(section.key, section);
  }

  return diagnostics;
}

function sectionOrderDiagnostics(component: ComponentDraft): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  let maxRank = -1;
  let highestSection: string | null = null;

  for (const section of component.sections) {
    const rank = CANONICAL_SECTION_ORDER.get(section.key);
    if (rank === undefined) {
      continue;
    }

    if (rank < maxRank) {
      diagnostics.push({
        severity: "warning",
        code: "non_canonical_section_order",
        message: `Section '${section.title}' should appear before '${highestSection ?? "later sections"}' in '${component.name}'.`,
        source_span: section.span,
      });
      continue;
    }

    maxRank = rank;
    highestSection = section.title;
  }

  return diagnostics;
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

function resolvePackageScopeRoot(path: string): string {
  let current = resolve(path);
  if (!existsSync(current)) {
    return current;
  }

  if (!isDirectory(current)) {
    current = dirname(current);
  }

  while (true) {
    if (existsSync(resolve(current, "prose.package.json"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) {
      return resolve(path);
    }
    current = parent;
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
