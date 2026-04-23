import type {
  AccessIR,
  Diagnostic,
  EffectIR,
  EnvironmentIR,
  ExecutionIR,
  PortIR,
  RuntimeSettingIR,
  ServiceIR,
} from "./types";
import type { SectionDraft, SourceLine } from "./markdown";
import { span } from "./markdown";
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
      diagnostics.push({
        severity: "warning",
        code: "malformed_port",
        message: `Port item '${item}' is missing a ':' separator.`,
        source_span: span(section.span.path, line.number, line.number),
      });
      continue;
    }

    const rawName = item.slice(0, colonIndex).trim();
    const remainder = item.slice(colonIndex + 1).trim();
    const { type, description } = parseTypeAndDescription(remainder);

    ports.push({
      name: stripTicks(rawName),
      direction,
      type,
      description,
      required: !/\boptional\b/i.test(description),
      policy_labels: [],
      source_span: span(section.span.path, line.number, line.number),
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

  const services: ServiceIR[] = [];

  for (const line of topLevelListItems(section.lines, { skipFences: true })) {
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
        return {
          language: "prose",
          body: trimTrailingBlankLines(body.map((bodyLine) => bodyLine.text)).join(
            "\n",
          ),
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

function parseTypeAndDescription(value: string): {
  type: string;
  description: string;
} {
  const typed = value.match(/^([A-Za-z][A-Za-z0-9_./<>,\-\[\]]*)\s+-\s+(.+)$/);
  if (typed) {
    return { type: typed[1], description: typed[2].trim() };
  }

  return { type: "Any", description: value };
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

function trimTrailingBlankLines(lines: string[]): string[] {
  const next = [...lines];
  while (next.length && next[next.length - 1].trim() === "") {
    next.pop();
  }
  return next;
}
