import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileSource } from "./compiler";
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
    "execution",
  ].map((key, index) => [key, index]),
);

export interface LintOptions {
  path: string;
}

export async function lintFile(path: string): Promise<Diagnostic[]> {
  const source = await readFile(resolve(path), "utf8");
  return lintSource(source, { path });
}

export function lintSource(source: string, options: LintOptions): Diagnostic[] {
  const ir = compileSource(source, { path: options.path });
  const diagnostics = [...ir.diagnostics];
  const drafts = parseContractMarkdown(source, normalizePath(options.path), []);

  diagnostics.push(...canonicalSourceDiagnostics(options.path));
  diagnostics.push(...sectionDiagnostics(drafts));

  return sortDiagnostics(diagnostics);
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

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
