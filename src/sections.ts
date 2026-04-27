import type {
  AccessIR,
  ContractTextSectionIR,
  Diagnostic,
  EffectIR,
  EnvironmentIR,
  ExecutionIR,
  ExecutionStepIR,
  PortIR,
  RuntimeSettingIR,
  ServiceIR,
} from "./types";
import type { SectionDraft, SourceLine } from "./markdown";
import { span } from "./markdown";
import { parseTypeExpression } from "./schema/index.js";
import { splitCsv, stripTicks } from "./text";

export function parsePorts(
  section: SectionDraft | undefined,
  direction: "input" | "output",
  diagnostics: Diagnostic[],
): PortIR[] {
  if (!section) {
    return [];
  }

  const ports: PortIR[] = [];
  for (const line of topLevelListItems(section.lines)) {
    const item = line.item.trim();
    if (/^\(?nothing\b/i.test(item)) {
      continue;
    }

    const colonIndex = item.indexOf(":");
    if (colonIndex < 0) {
      if (looksLikeMalformedPort(item)) {
        diagnostics.push({
          severity: "warning",
          code: "malformed_port",
          message: `Port item '${item}' is missing a ':' separator.`,
          source_span: span(section.span.path, line.number, line.number),
        });
      }
      continue;
    }

    const rawName = item.slice(0, colonIndex).trim();
    if (!looksLikePortName(rawName)) {
      continue;
    }
    const remainder = item.slice(colonIndex + 1).trim();
    const { type, description, policyLabels } = parseTypeAndDescription(remainder);
    const source_span = span(section.span.path, line.number, line.number);
    const typeResult = parseTypeExpression(type, source_span);
    diagnostics.push(...typeResult.diagnostics);

    ports.push({
      name: stripTicks(rawName),
      direction,
      type,
      type_expr: typeResult.expression,
      description,
      required: !/\boptional\b/i.test(description),
      policy_labels: policyLabels,
      source_span,
    });
  }

  return ports;
}

export function parseServices(
  section: SectionDraft | undefined,
): ServiceIR[] {
  if (!section) {
    return [];
  }

  const shorthand = parseCompositeServiceShorthand(section);
  const services: ServiceIR[] = [...shorthand.services];

  for (const line of topLevelListItems(section.lines, { skipFences: true })) {
    if (shorthand.consumedLines.has(line.number)) {
      continue;
    }
    const name = stripTicks(line.item.trim());
    services.push({
      name,
      ref: name,
      compose: null,
      with: {},
      source_span: span(section.span.path, line.number, line.number),
    });
  }

  services.push(...parseStructuredServices(section));
  return services;
}

function parseCompositeServiceShorthand(section: SectionDraft): {
  services: ServiceIR[];
  consumedLines: Set<number>;
} {
  const services: ServiceIR[] = [];
  const consumedLines = new Set<number>();

  for (let index = 0; index < section.lines.length; index += 1) {
    const line = section.lines[index];
    const match = line.text.match(/^-\s+`?([^`:]+)`?:\s*`?([^`]+)`?\s*$/);
    if (!match) {
      continue;
    }

    const [, rawName, rawCompose] = match;
    const withValues: Record<string, string | number | boolean> = {};
    let endLine = line.number;
    consumedLines.add(line.number);

    let childIndex = index + 1;
    while (childIndex < section.lines.length) {
      const child = section.lines[childIndex];
      if (/^-\s+/.test(child.text)) {
        break;
      }
      const childMatch = child.text.match(/^\s{2,}-\s+`?([^`:]+)`?:\s*`?([^`]+)`?\s*$/);
      if (childMatch) {
        withValues[stripTicks(childMatch[1])] = parseInlineValue(stripTicks(childMatch[2]));
        consumedLines.add(child.number);
        endLine = child.number;
      }
      childIndex += 1;
    }

    const name = stripTicks(rawName);
    const compose = stripTicks(rawCompose);
    services.push({
      name,
      ref: compose,
      compose,
      with: withValues,
      source_span: span(section.span.path, line.number, endLine),
    });
  }

  return { services, consumedLines };
}

export function parseEnvironment(
  section: SectionDraft | undefined,
  diagnostics: Diagnostic[],
): EnvironmentIR[] {
  if (!section) {
    return [];
  }

  const environment: EnvironmentIR[] = [];
  for (const line of topLevelListItems(section.lines)) {
    const item = line.item.trim();
    const colonIndex = item.indexOf(":");
    if (colonIndex < 0) {
      diagnostics.push({
        severity: "warning",
        code: "malformed_environment",
        message: `Environment item '${item}' is missing a ':' separator.`,
        source_span: span(section.span.path, line.number, line.number),
      });
      continue;
    }

    const name = stripTicks(item.slice(0, colonIndex));
    const description = item.slice(colonIndex + 1).trim();
    environment.push({
      name,
      description,
      required: !/\boptional\b/i.test(description),
      source_span: span(section.span.path, line.number, line.number),
    });
  }
  return environment;
}

export function parseRuntime(
  section: SectionDraft | undefined,
  diagnostics: Diagnostic[],
): RuntimeSettingIR[] {
  if (!section) {
    return [];
  }

  const runtime: RuntimeSettingIR[] = [];
  for (const line of topLevelListItems(section.lines)) {
    const item = line.item.trim();
    const colonIndex = item.indexOf(":");
    if (colonIndex < 0) {
      diagnostics.push({
        severity: "warning",
        code: "malformed_runtime",
        message: `Runtime item '${item}' is missing a ':' separator.`,
        source_span: span(section.span.path, line.number, line.number),
      });
      continue;
    }

    runtime.push({
      key: stripTicks(item.slice(0, colonIndex)),
      value: parseScalar(item.slice(colonIndex + 1).trim()),
      source_span: span(section.span.path, line.number, line.number),
    });
  }

  return runtime;
}

export function parseEffects(
  section: SectionDraft | undefined,
  diagnostics: Diagnostic[],
): EffectIR[] {
  if (!section) {
    return [];
  }

  const effects: EffectIR[] = [];
  for (const line of topLevelListItems(section.lines)) {
    const item = line.item.trim();
    const colonIndex = item.indexOf(":");
    if (colonIndex < 0) {
      diagnostics.push({
        severity: "warning",
        code: "malformed_effect",
        message: `Effect item '${item}' is missing a ':' separator.`,
        source_span: span(section.span.path, line.number, line.number),
      });
      continue;
    }

    const { description, config } = parseEffectDescription(
      item.slice(colonIndex + 1).trim(),
    );
    effects.push({
      kind: stripTicks(item.slice(0, colonIndex)),
      description,
      config,
      source_span: span(section.span.path, line.number, line.number),
    });
  }

  if (effects.some((effect) => effect.kind === "pure") && effects.length > 1) {
    diagnostics.push({
      severity: "error",
      code: "pure_effect_is_exclusive",
      message: "`pure` cannot be declared with any other effect.",
      source_span: section.span,
    });
  }

  return effects;
}

export function parseAccess(section: SectionDraft | undefined): AccessIR {
  if (!section) {
    return { rules: {} };
  }

  const rules: Record<string, string[]> = {};
  for (const line of topLevelListItems(section.lines)) {
    const item = line.item.trim();
    const colonIndex = item.indexOf(":");
    if (colonIndex < 0) {
      continue;
    }

    const key = stripTicks(item.slice(0, colonIndex));
    const value = item.slice(colonIndex + 1).trim();
    rules[key] = splitCsv(value);
  }

  return { rules, source_span: section.span };
}

export function parseTextSection(
  section: SectionDraft | undefined,
): ContractTextSectionIR | null {
  if (!section) {
    return null;
  }

  return {
    key: section.key,
    title: section.title,
    body: trimTrailingBlankLines(section.lines)
      .map((line) => line.text)
      .join("\n")
      .trim(),
    source_span: section.span,
  };
}

export function parseExecution(
  section: SectionDraft | undefined,
  diagnostics: Diagnostic[],
): ExecutionIR | null {
  if (!section) {
    return null;
  }

  let fenceStart: SourceLine | null = null;
  const body: SourceLine[] = [];

  for (const line of section.lines) {
    const fence = line.text.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      if (!fenceStart && fence[1] === "prose") {
        fenceStart = line;
        body.length = 0;
        continue;
      }

      if (fenceStart) {
        const trimmedBody = trimTrailingBlankLines(body);
        return {
          language: "prose",
          body: trimmedBody.map((bodyLine) => bodyLine.text).join("\n"),
          steps: parseExecutionSteps(trimmedBody, diagnostics, section.span.path),
          source_span: span(
            section.span.path,
            fenceStart.number + 1,
            Math.max(fenceStart.number + 1, line.number - 1),
          ),
        };
      }
    }

    if (fenceStart) {
      body.push(line);
    }
  }

  if (section.lines.some((line) => line.text.trim())) {
    diagnostics.push({
      severity: "warning",
      code: "raw_execution_body",
      message: "Execution sections should use a fenced ```prose code block.",
      source_span: section.span,
    });
  }

  return null;
}

function parseExecutionSteps(
  lines: SourceLine[],
  diagnostics: Diagnostic[],
  path: string,
): ExecutionStepIR[] {
  return parseExecutionBlock(lines, 0, diagnostics, path).steps;
}

function parseExecutionBlock(
  lines: SourceLine[],
  startIndex: number,
  diagnostics: Diagnostic[],
  path: string,
  baseIndent = 0,
): { steps: ExecutionStepIR[]; nextIndex: number } {
  const steps: ExecutionStepIR[] = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.text.trim()) {
      index += 1;
      continue;
    }

    const indent = indentation(line.text);
    if (indent < baseIndent) {
      break;
    }

    const raw = line.text.trim();
    if (raw === "parallel:") {
      const child = collectIndentedBlock(lines, index + 1, indent);
      const parsed = parseExecutionBlock(child.lines, 0, diagnostics, path, indent + 2);
      steps.push({
        kind: "parallel",
        raw,
        steps: parsed.steps,
        source_span: span(path, line.number, child.endLine ?? line.number),
      });
      index = child.nextIndex;
      continue;
    }

    const call = parseCallLine(raw);
    if (call) {
      const bindings: Record<string, string> = {};
      let endLine = line.number;
      index += 1;
      while (index < lines.length) {
        const bindingLine = lines[index];
        if (!bindingLine.text.trim()) {
          index += 1;
          continue;
        }
        if (indentation(bindingLine.text) <= indent) {
          break;
        }
        const binding = bindingLine.text.trim().match(/^`?([A-Za-z0-9_-]+)`?:\s*(.+)$/);
        if (binding) {
          bindings[binding[1]] = binding[2].trim();
        } else {
          diagnostics.push({
            severity: "warning",
            code: "unparsed_execution_binding",
            message: `Execution binding '${bindingLine.text.trim()}' could not be parsed.`,
            source_span: span(path, bindingLine.number, bindingLine.number),
          });
        }
        endLine = bindingLine.number;
        index += 1;
      }
      steps.push({
        kind: "call",
        raw,
        target: call.target,
        assign: call.assign,
        bindings,
        source_span: span(path, line.number, endLine),
      });
      continue;
    }

    const returnValue = raw.match(/^return\s+(.+)$/);
    if (returnValue) {
      steps.push({
        kind: "return",
        raw,
        value: returnValue[1].trim(),
        source_span: span(path, line.number, line.number),
      });
      index += 1;
      continue;
    }

    const condition = raw.match(/^if\s+(.+):$/);
    if (condition) {
      const child = collectIndentedBlock(lines, index + 1, indent);
      const parsed = parseExecutionBlock(child.lines, 0, diagnostics, path, indent + 2);
      steps.push({
        kind: "condition",
        raw,
        condition: condition[1].trim(),
        body: parsed.steps,
        source_span: span(path, line.number, child.endLine ?? line.number),
      });
      index = child.nextIndex;
      continue;
    }

    const forEach = raw.match(/^for\s+each\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+):$/);
    if (forEach) {
      const child = collectIndentedBlock(lines, index + 1, indent);
      const parsed = parseExecutionBlock(child.lines, 0, diagnostics, path, indent + 2);
      steps.push({
        kind: "loop",
        raw,
        iterator: forEach[1],
        iterable: forEach[2].trim(),
        body: parsed.steps,
        source_span: span(path, line.number, child.endLine ?? line.number),
      });
      index = child.nextIndex;
      continue;
    }

    if (raw === "loop:") {
      const child = collectIndentedBlock(lines, index + 1, indent);
      const parsed = parseExecutionBlock(child.lines, 0, diagnostics, path, indent + 2);
      steps.push({
        kind: "loop",
        raw,
        iterator: null,
        iterable: null,
        body: parsed.steps,
        source_span: span(path, line.number, child.endLine ?? line.number),
      });
      index = child.nextIndex;
      continue;
    }

    if (raw === "try:") {
      const child = collectIndentedBlock(lines, index + 1, indent);
      const parsed = parseExecutionBlock(child.lines, 0, diagnostics, path, indent + 2);
      steps.push({
        kind: "try",
        raw,
        body: parsed.steps,
        source_span: span(path, line.number, child.endLine ?? line.number),
      });
      index = child.nextIndex;
      continue;
    }

    steps.push({
      kind: "text",
      raw,
      text: raw,
      source_span: span(path, line.number, line.number),
    });
    index += 1;
  }

  return { steps, nextIndex: index };
}

function collectIndentedBlock(
  lines: SourceLine[],
  startIndex: number,
  parentIndent: number,
): { lines: SourceLine[]; nextIndex: number; endLine: number | null } {
  const block: SourceLine[] = [];
  let index = startIndex;
  let endLine: number | null = null;
  while (index < lines.length) {
    const line = lines[index];
    if (line.text.trim() && indentation(line.text) <= parentIndent) {
      break;
    }
    block.push(line);
    if (line.text.trim()) {
      endLine = line.number;
    }
    index += 1;
  }
  return { lines: block, nextIndex: index, endLine };
}

function parseCallLine(raw: string): { assign: string | null; target: string } | null {
  const assigned = raw.match(/^let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*call\s+([A-Za-z0-9_.-]+)$/);
  if (assigned) {
    return { assign: assigned[1], target: assigned[2] };
  }

  const direct = raw.match(/^call\s+([A-Za-z0-9_.-]+)$/);
  if (direct) {
    return { assign: null, target: direct[1] };
  }

  return null;
}

function indentation(value: string): number {
  return value.match(/^\s*/)?.[0].length ?? 0;
}


interface ListItem {
  item: string;
  number: number;
}

function topLevelListItems(
  lines: SourceLine[],
  options: { skipFences?: boolean } = {},
): ListItem[] {
  const items: ListItem[] = [];
  let inFence = false;

  for (const line of lines) {
    if (line.text.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (options.skipFences && inFence) {
      continue;
    }

    const match = line.text.match(/^-\s+(.+)$/);
    if (match) {
      items.push({ item: match[1], number: line.number });
    }
  }

  return items;
}

function looksLikeMalformedPort(item: string): boolean {
  return item.trim().startsWith("`");
}

function looksLikePortName(rawName: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(stripTicks(rawName.trim()));
}

function parseTypeAndDescription(value: string): {
  type: string;
  description: string;
  policyLabels: string[];
} {
  const typed = value.match(
    /^([A-Za-z][A-Za-z0-9_./<>,\-\[\]]*)(?:\s+\[([^\]]+)\])?\s+-\s+(.+)$/,
  );
  if (typed) {
    return {
      type: typed[1],
      policyLabels: splitCsv(typed[2] ?? ""),
      description: typed[3].trim(),
    };
  }

  return { type: "Any", description: value, policyLabels: [] };
}

function parseEffectDescription(value: string): {
  description: string;
  config: Record<string, string | number | boolean>;
} {
  const segments = value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { description: "", config: {} };
  }

  const [first, ...rest] = segments;
  const config: Record<string, string | number | boolean> = {};

  for (const segment of rest) {
    const freshness = segment.match(/^freshness\s+(.+)$/i);
    if (freshness) {
      config.freshness = String(parseScalar(freshness[1]));
      continue;
    }

    const keyed = segment.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.+)$/);
    if (keyed) {
      const [, key, rawValue] = keyed;
      const parsed = parseScalar(rawValue);
      if (typeof parsed === "string" || typeof parsed === "number" || typeof parsed === "boolean") {
        config[key] = parsed;
      }
      continue;
    }
  }

  return {
    description: first,
    config,
  };
}

function parseScalar(rawValue: string): string | number | boolean | string[] {
  const value = stripTicks(rawValue.trim());
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
      .map((item) => stripTicks(item.trim()))
      .filter(Boolean);
  }
  return value;
}

function parseStructuredServices(section: SectionDraft): ServiceIR[] {
  const services: ServiceIR[] = [];
  let inYaml = false;
  let current:
    | {
        fields: Record<string, string | number | boolean>;
        with: Record<string, string | number | boolean>;
        line: number;
      }
    | null = null;
  let inWith = false;

  const flush = () => {
    if (!current) {
      return;
    }
    const name = String(current.fields.name ?? current.fields.compose ?? "");
    if (name) {
      services.push({
        name,
        ref: name,
        compose:
          typeof current.fields.compose === "string" ? current.fields.compose : null,
        with: current.with,
        source_span: span(section.span.path, current.line, current.line),
      });
    }
    current = null;
    inWith = false;
  };

  for (const line of section.lines) {
    const fence = line.text.match(/^```\s*([A-Za-z0-9_-]+)?\s*$/);
    if (fence) {
      if (!inYaml && (fence[1] === "yaml" || fence[1] === "yml")) {
        inYaml = true;
        continue;
      }
      if (inYaml) {
        flush();
        inYaml = false;
      }
      continue;
    }

    if (!inYaml) {
      continue;
    }

    const item = line.text.match(/^\s*-\s+([A-Za-z0-9_-]+):\s*(.+)$/);
    if (item) {
      flush();
      current = {
        fields: { [item[1]]: parseInlineValue(item[2]) },
        with: {},
        line: line.number,
      };
      continue;
    }

    const field = line.text.match(/^\s{2,}([A-Za-z0-9_-]+):\s*(.*)$/);
    if (field && current) {
      const [, key, value] = field;
      if (key === "with") {
        inWith = true;
        continue;
      }
      if (inWith) {
        current.with[key] = parseInlineValue(value);
      } else {
        current.fields[key] = parseInlineValue(value);
      }
    }
  }

  return services;
}

function parseInlineValue(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed.replace(/^["']|["']$/g, "");
}

function trimTrailingBlankLines<T extends string | SourceLine>(lines: T[]): T[] {
  const next = [...lines];
  while (next.length && sourceLineText(next[next.length - 1]).trim() === "") {
    next.pop();
  }
  return next;
}

function sourceLineText(line: string | SourceLine): string {
  return typeof line === "string" ? line : line.text;
}
