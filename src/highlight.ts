import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { HighlightToken, HighlightView } from "./types";

export async function highlightFile(path: string): Promise<HighlightView> {
  const source = await readFile(resolve(path), "utf8");
  return highlightSource(source, path);
}

export function highlightSource(source: string, path: string): HighlightView {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const tokens: HighlightToken[] = [];
  let inFrontmatter = false;
  let inExecution = false;
  let currentSection = "";

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      return;
    }

    if (inFrontmatter) {
      const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
      if (match) {
        pushToken(tokens, lineNumber, match.index ?? 0, (match.index ?? 0) + match[1].length, "frontmatter.key", match[1]);
        if (match[1] === "kind" && match[2].trim()) {
          const start = line.indexOf(match[2]);
          pushToken(tokens, lineNumber, start, start + match[2].trim().length, "component.kind", match[2].trim());
        }
      }
      return;
    }

    const section = line.match(/^###(?!#)\s+(.+?)\s*$/);
    if (section) {
      currentSection = section[1].trim().toLowerCase();
      const start = line.indexOf(section[1]);
      pushToken(tokens, lineNumber, start, start + section[1].length, "section.header", section[1]);
      return;
    }

    const fence = line.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      if (!inExecution && fence[1] === "prose") {
        inExecution = true;
      } else if (inExecution) {
        inExecution = false;
      }
      return;
    }

    if (inExecution) {
      highlightExecutionLine(tokens, line, lineNumber);
      return;
    }

    if (!line.trim().startsWith("-")) {
      return;
    }

    switch (currentSection) {
      case "requires":
      case "ensures":
        highlightPortLine(tokens, line, lineNumber);
        break;
      case "services":
        highlightServiceLine(tokens, line, lineNumber);
        break;
      case "effects":
        highlightEffectLine(tokens, line, lineNumber);
        break;
      case "access":
        highlightAccessLine(tokens, line, lineNumber);
        break;
      case "environment":
        highlightEnvironmentLine(tokens, line, lineNumber);
        break;
      default:
        break;
    }
  });

  return {
    highlight_version: "0.1",
    path: normalizePath(path),
    tokens,
  };
}

export function renderHighlightText(view: HighlightView): string {
  if (view.tokens.length === 0) {
    return "No highlight tokens.\n";
  }

  const byLine = new Map<number, HighlightToken[]>();
  for (const token of view.tokens) {
    const existing = byLine.get(token.line) ?? [];
    existing.push(token);
    byLine.set(token.line, existing);
  }

  const lines: string[] = [];
  for (const line of Array.from(byLine.keys()).sort((a, b) => a - b)) {
    lines.push(`${line}:`);
    for (const token of (byLine.get(line) ?? []).sort((a, b) => a.start - b.start)) {
      lines.push(`  - ${token.scope}: ${token.text}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function highlightPortLine(tokens: HighlightToken[], line: string, lineNumber: number): void {
  const match = line.match(/^\s*-\s+`([^`]+)`:\s*([A-Za-z][A-Za-z0-9_./<>,\-\[\]]*)?/);
  if (!match) {
    return;
  }

  const nameStart = line.indexOf(`\`${match[1]}\``) + 1;
  pushToken(tokens, lineNumber, nameStart, nameStart + match[1].length, "port.name", match[1]);

  if (match[2]) {
    const typeStart = line.indexOf(match[2], nameStart + match[1].length);
    pushToken(tokens, lineNumber, typeStart, typeStart + match[2].length, "port.type", match[2]);
  }
}

function highlightServiceLine(tokens: HighlightToken[], line: string, lineNumber: number): void {
  const match = line.match(/^\s*-\s+`?([^`]+?)`?\s*$/);
  if (!match) {
    return;
  }
  const start = line.indexOf(match[1]);
  pushToken(tokens, lineNumber, start, start + match[1].length, "service.ref", match[1]);
}

function highlightEffectLine(tokens: HighlightToken[], line: string, lineNumber: number): void {
  const match = line.match(/^\s*-\s+`([^`]+)`:/);
  if (!match) {
    return;
  }
  const start = line.indexOf(`\`${match[1]}\``) + 1;
  pushToken(tokens, lineNumber, start, start + match[1].length, "effect.kind", match[1]);
}

function highlightAccessLine(tokens: HighlightToken[], line: string, lineNumber: number): void {
  const keyMatch = line.match(/^\s*-\s+([A-Za-z0-9_.-]+):/);
  if (keyMatch) {
    const keyStart = line.indexOf(keyMatch[1]);
    pushToken(tokens, lineNumber, keyStart, keyStart + keyMatch[1].length, "access.key", keyMatch[1]);
  }

  const values = line.slice(line.indexOf(":") + 1).split(",");
  let searchFrom = line.indexOf(":") + 1;
  for (const rawValue of values) {
    const value = rawValue.trim();
    if (!value) {
      continue;
    }
    const start = line.indexOf(value, searchFrom);
    searchFrom = start + value.length;
    pushToken(tokens, lineNumber, start, start + value.length, "access.label", value);
  }
}

function highlightEnvironmentLine(tokens: HighlightToken[], line: string, lineNumber: number): void {
  const match = line.match(/^\s*-\s+`?([A-Z0-9_]+)`?:/);
  if (!match) {
    return;
  }
  const start = line.indexOf(match[1]);
  pushToken(tokens, lineNumber, start, start + match[1].length, "env.name", match[1]);
}

function highlightExecutionLine(tokens: HighlightToken[], line: string, lineNumber: number): void {
  for (const keyword of ["let", "call", "return", "parallel", "loop", "condition", "try"]) {
    const pattern = new RegExp(`\\b${keyword}\\b`, "g");
    for (const match of line.matchAll(pattern)) {
      const start = match.index ?? 0;
      pushToken(tokens, lineNumber, start, start + keyword.length, "prose.keyword", keyword);
    }
  }

  const callMatch = line.match(/\bcall\s+([A-Za-z0-9_.-]+)/);
  if (callMatch) {
    const start = line.indexOf(callMatch[1], line.indexOf("call"));
    pushToken(tokens, lineNumber, start, start + callMatch[1].length, "prose.call_target", callMatch[1]);
  }

  const returnMatch = line.match(/\breturn\s+([A-Za-z0-9_.-]+)/);
  if (returnMatch) {
    const start = line.indexOf(returnMatch[1], line.indexOf("return"));
    pushToken(tokens, lineNumber, start, start + returnMatch[1].length, "prose.return_value", returnMatch[1]);
  }
}

function pushToken(
  tokens: HighlightToken[],
  line: number,
  start: number,
  end: number,
  scope: string,
  text: string,
): void {
  tokens.push({ line, start, end, scope, text });
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}
