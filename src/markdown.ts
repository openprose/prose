import type { ComponentKind, Diagnostic, SourceSpan } from "./types";
import { normalizeSectionName, stripQuotes } from "./text";

export interface SourceLine {
  text: string;
  number: number;
}

export interface SectionDraft {
  title: string;
  key: string;
  lines: SourceLine[];
  span: SourceSpan;
}

export interface ComponentDraft {
  name: string;
  kind: ComponentKind;
  sourceSpan: SourceSpan;
  sections: SectionDraft[];
  frontmatter: Record<string, unknown>;
}

interface FrontmatterResult {
  data: Record<string, unknown>;
  nextIndex: number;
}

export function parseContractMarkdown(
  source: string,
  path: string,
  diagnostics: Diagnostic[],
): ComponentDraft[] {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const frontmatter = parseFrontmatter(lines, 0, path, diagnostics);
  const fileName = inferFileName(path);
  const fileKind = parseKind(frontmatter.data.kind, path, 1, diagnostics);
  const fileComponent: ComponentDraft = {
    name: parseName(frontmatter.data.name, fileName),
    kind: fileKind,
    sourceSpan: span(path, 1, Math.max(lines.length, 1)),
    sections: [],
    frontmatter: frontmatter.data,
  };

  const components: ComponentDraft[] = [fileComponent];
  let current = fileComponent;
  let index = frontmatter.nextIndex;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const h2 = line.match(/^##(?!#)\s+(.+?)\s*$/);
    const h3 = line.match(/^###(?!#)\s+(.+?)\s*$/);

    if (h2) {
      current.sourceSpan.end_line = Math.max(current.sourceSpan.start_line, index);

      const headingLine = index + 1;
      const headingName = h2[1].trim();
      const inlineFrontmatter = parseInlineFrontmatter(
        lines,
        index + 1,
        path,
        diagnostics,
      );

      const kind = parseKind(
        inlineFrontmatter.data.kind ?? "service",
        path,
        headingLine,
        diagnostics,
      );
      const name = parseName(inlineFrontmatter.data.name, headingName);
      if (inlineFrontmatter.data.name && name !== headingName) {
        diagnostics.push({
          severity: "warning",
          code: "inline_name_mismatch",
          message: `Inline component name '${name}' does not match heading '${headingName}'.`,
          source_span: span(path, headingLine, headingLine),
        });
      }

      current = {
        name,
        kind,
        sourceSpan: span(path, headingLine, Math.max(headingLine, lines.length)),
        sections: [],
        frontmatter: inlineFrontmatter.data,
      };
      components.push(current);
      index = inlineFrontmatter.nextIndex;
      continue;
    }

    if (h3) {
      const sectionStart = index + 1;
      const title = h3[1].trim();
      const contentLines: SourceLine[] = [];
      index += 1;

      while (index < lines.length) {
        const nextLine = lines[index] ?? "";
        if (/^###(?!#)\s+/.test(nextLine) || /^##(?!#)\s+/.test(nextLine)) {
          break;
        }
        contentLines.push({ text: nextLine, number: index + 1 });
        index += 1;
      }

      const sectionEnd =
        contentLines.length > 0
          ? contentLines[contentLines.length - 1].number
          : sectionStart;
      current.sections.push({
        title,
        key: normalizeSectionName(title),
        lines: contentLines,
        span: span(path, sectionStart, sectionEnd),
      });
      continue;
    }

    index += 1;
  }

  current.sourceSpan.end_line = Math.max(
    current.sourceSpan.start_line,
    lines.length,
  );

  return components;
}

export function findSection(
  component: ComponentDraft,
  key: string,
): SectionDraft | undefined {
  return component.sections.find((section) => section.key === key);
}

export function span(path: string, startLine: number, endLine: number): SourceSpan {
  return {
    path,
    start_line: startLine,
    end_line: Math.max(startLine, endLine),
  };
}

function parseFrontmatter(
  lines: string[],
  startIndex: number,
  path: string,
  diagnostics: Diagnostic[],
): FrontmatterResult {
  if ((lines[startIndex] ?? "").trim() !== "---") {
    return { data: {}, nextIndex: startIndex };
  }

  const body: string[] = [];
  const bodyStart = startIndex + 1;
  let index = bodyStart;
  while (index < lines.length && (lines[index] ?? "").trim() !== "---") {
    body.push(lines[index] ?? "");
    index += 1;
  }

  if (index >= lines.length) {
    diagnostics.push({
      severity: "error",
      code: "unterminated_frontmatter",
      message: "YAML frontmatter starts with --- but has no closing delimiter.",
      source_span: span(path, startIndex + 1, lines.length),
    });
    const data = parseSimpleYaml(body);
    validateFrontmatter(data, body, bodyStart, path, diagnostics);
    return { data, nextIndex: lines.length };
  }

  const data = parseSimpleYaml(body);
  validateFrontmatter(data, body, bodyStart, path, diagnostics);
  return { data, nextIndex: index + 1 };
}

function parseInlineFrontmatter(
  lines: string[],
  startIndex: number,
  path: string,
  diagnostics: Diagnostic[],
): FrontmatterResult {
  if ((lines[startIndex] ?? "").trim() !== "---") {
    return { data: {}, nextIndex: startIndex };
  }
  return parseFrontmatter(lines, startIndex, path, diagnostics);
}

function parseSimpleYaml(lines: string[]): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  let index = 0;

  while (index < lines.length) {
    const rawLine = lines[index];
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      index += 1;
      continue;
    }

    const keyMatch = rawLine.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      index += 1;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    const valueText = rawValue.trim();

    if (valueText === "") {
      // Possibly an indented list block on subsequent lines.
      const items: string[] = [];
      let look = index + 1;
      while (look < lines.length) {
        const next = lines[look];
        if (!next.trim()) {
          look += 1;
          continue;
        }
        const itemMatch = next.match(/^\s+-\s+(.*)$/);
        if (itemMatch) {
          items.push(stripQuotes(itemMatch[1].trim()));
          look += 1;
          continue;
        }
        break;
      }
      if (items.length > 0) {
        data[key] = items;
        index = look;
        continue;
      }
      data[key] = "";
      index += 1;
      continue;
    }

    data[key] = parseYamlScalar(valueText);
    index += 1;
  }

  return data;
}

function validateFrontmatter(
  data: Record<string, unknown>,
  body: string[],
  bodyStart: number,
  path: string,
  diagnostics: Diagnostic[],
): void {
  if ("skills" in data) {
    const value = data.skills;
    const isStringArray =
      Array.isArray(value) && value.every((item) => typeof item === "string");
    if (!isStringArray) {
      const skillsLineIndex = body.findIndex((line) =>
        /^skills\s*:/.test(line),
      );
      const lineNumber =
        skillsLineIndex >= 0 ? bodyStart + skillsLineIndex + 1 : bodyStart;
      diagnostics.push({
        severity: "error",
        code: "skills_invalid_shape",
        message:
          "skills: must be a list of skill names (e.g. - document-skills:pdf)",
        source_span: span(path, lineNumber, lineNumber),
      });
    }
  }
}

function parseYamlScalar(rawValue: string): unknown {
  const value = rawValue.trim();
  if (!value) {
    return "";
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
  return stripQuotes(value);
}

function parseName(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return fallback.trim();
}

function parseKind(
  value: unknown,
  path: string,
  line: number,
  diagnostics: Diagnostic[],
): ComponentKind {
  if (
    value === "program" ||
    value === "service" ||
    value === "composite" ||
    value === "test" ||
    value === "system"
  ) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    diagnostics.push({
      severity: "warning",
      code: "unknown_component_kind",
      message: `Unknown component kind '${value}', defaulting to service.`,
      source_span: span(path, line, line),
    });
  }

  return "service";
}

function inferFileName(path: string): string {
  const last = path.split(/[\\/]/).pop() ?? "component";
  return last.replace(/\.prose\.md$/i, "").replace(/\.md$/i, "");
}

