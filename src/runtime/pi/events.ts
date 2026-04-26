import type {
  GraphVmKind,
  NodeTelemetryEvent,
} from "../../node-runners/protocol.js";
import type { OutputSubmissionResult } from "../output-submission.js";

export interface PiRuntimeEventContext {
  graph_vm: GraphVmKind;
  model_provider: string | null;
  model: string | null;
  session_id: string | null;
  session_file: string | null;
  now?: () => string;
}

export function normalizePiRuntimeEvent(
  event: unknown,
  context: PiRuntimeEventContext,
): NodeTelemetryEvent[] {
  if (!event || typeof event !== "object") {
    return [
      baseEvent("pi.event.unknown", context, {
        raw_event: String(event),
      }),
    ];
  }

  const type = readString(event, "type") ?? "unknown";
  const normalized = normalizeKnownPiEvent(type, event, context);
  const usage = usageEvent(event, context);
  return usage ? [...normalized, usage] : normalized;
}

export function outputSubmissionTelemetryEvent(
  result: OutputSubmissionResult,
  context: PiRuntimeEventContext,
): NodeTelemetryEvent {
  return baseEvent(`pi.output_submission.${result.status}`, context, {
    output_ports: result.artifacts.map((artifact) => artifact.port).sort(),
    performed_effects: result.performed_effects,
    diagnostic_codes: result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
    failure_class: result.status === "rejected" ? "output_submission_rejected" : null,
  });
}

function normalizeKnownPiEvent(
  type: string,
  event: object,
  context: PiRuntimeEventContext,
): NodeTelemetryEvent[] {
  if (type === "agent_start") {
    return [
      baseEvent("pi.session.started", context, {
        source_event: type,
      }),
    ];
  }
  if (type === "agent_end") {
    return [
      baseEvent("pi.session.finished", context, {
        source_event: type,
      }),
    ];
  }
  if (type === "agent_abort") {
    return [
      baseEvent("pi.session.aborted", context, {
        source_event: type,
        failure_class: "aborted",
      }),
    ];
  }
  if (type === "assistant_message") {
    return [
      baseEvent("pi.assistant.message", context, {
        source_event: type,
        content_preview: assistantMessagePreview(event),
      }),
    ];
  }
  if (type === "tool_start") {
    return [
      baseEvent("pi.tool.started", context, {
        source_event: type,
        tool_name: toolName(event),
      }),
    ];
  }
  if (type === "tool_end") {
    return [
      baseEvent("pi.tool.finished", context, {
        source_event: type,
        tool_name: toolName(event),
      }),
    ];
  }
  if (type.includes("retry")) {
    return [
      baseEvent("pi.retry", context, {
        source_event: type,
        reason: readString(event, "reason") ?? readString(event, "message"),
      }),
    ];
  }

  const error = errorMessage(event);
  if (error) {
    return [
      baseEvent("pi.model.error", context, {
        source_event: type,
        failure_class: "model_error",
        message: error,
      }),
    ];
  }

  return [
    baseEvent("pi.event", context, {
      source_event: type,
    }),
  ];
}

function baseEvent(
  event: string,
  context: PiRuntimeEventContext,
  extra: Record<string, unknown> = {},
): NodeTelemetryEvent {
  return {
    event,
    at: context.now?.() ?? new Date().toISOString(),
    graph_vm: context.graph_vm,
    session_id: context.session_id,
    session_file: context.session_file,
    model_provider: context.model_provider,
    model: context.model,
    ...extra,
  };
}

function usageEvent(
  event: object,
  context: PiRuntimeEventContext,
): NodeTelemetryEvent | null {
  const usage = usageObject(event);
  if (!usage) {
    return null;
  }
  const promptTokens = firstNumberValue(usage, [
    "prompt_tokens",
    "input_tokens",
    "input",
  ]);
  const completionTokens =
    firstNumberValue(usage, ["completion_tokens", "output_tokens", "output"]);
  const cacheReadTokens = firstNumberValue(usage, ["cache_read_tokens", "cacheRead"]);
  const cacheWriteTokens = firstNumberValue(usage, ["cache_write_tokens", "cacheWrite"]);
  const totalTokens = firstNumberValue(usage, ["total_tokens", "totalTokens"]) ??
    sumIfAny([promptTokens, completionTokens, cacheReadTokens, cacheWriteTokens]);
  const costUsd = costTotal(usage);
  if (
    promptTokens === null &&
    completionTokens === null &&
    cacheReadTokens === null &&
    cacheWriteTokens === null &&
    totalTokens === null &&
    costUsd === null
  ) {
    return null;
  }
  return baseEvent("pi.usage", context, {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    cache_read_tokens: cacheReadTokens,
    cache_write_tokens: cacheWriteTokens,
    total_tokens: totalTokens,
    cost_usd: costUsd,
  });
}

function usageObject(event: object): Record<string, unknown> | null {
  const direct = objectValue(event, "usage") ?? objectValue(event, "tokenUsage");
  if (direct) {
    return direct;
  }
  return objectValue(objectValue(event, "message") ?? {}, "usage");
}

function firstNumberValue(value: object, keys: string[]): number | null {
  for (const key of keys) {
    const entry = numberValue(value, key);
    if (entry !== null) {
      return entry;
    }
  }
  return null;
}

function sumIfAny(values: Array<number | null>): number | null {
  let total = 0;
  let found = false;
  for (const value of values) {
    if (value !== null) {
      total += value;
      found = true;
    }
  }
  return found ? total : null;
}

function costTotal(usage: Record<string, unknown>): number | null {
  const cost = usage.cost;
  if (typeof cost === "number" && Number.isFinite(cost)) {
    return cost;
  }
  if (!cost || typeof cost !== "object" || Array.isArray(cost)) {
    return null;
  }
  return firstNumberValue(cost as Record<string, unknown>, ["total", "usd"]);
}

function assistantMessagePreview(event: object): string | null {
  const message = objectValue(event, "message");
  const content = message
    ? readString(message, "content") ?? normalizeContent(message["content"])
    : null;
  if (!content) {
    return null;
  }
  return content.length > 180 ? `${content.slice(0, 180)}...` : content;
}

function normalizeContent(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const text = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      return readString(entry, "text");
    })
    .filter((entry): entry is string => Boolean(entry))
    .join("\n")
    .trim();
  return text.length > 0 ? text : null;
}

function toolName(event: object): string | null {
  return (
    readString(event, "name") ??
    readString(event, "tool") ??
    readString(event, "toolName") ??
    objectName(event, "tool")
  );
}

function errorMessage(event: object): string | null {
  const candidates = [event];
  for (const key of ["message", "assistantMessageEvent", "error"]) {
    const value = objectValue(event, key);
    if (value) {
      candidates.push(value);
    }
  }
  for (const candidate of candidates) {
    const message = readString(candidate, "errorMessage") ?? readString(candidate, "message");
    const stopReason = readString(candidate, "stopReason");
    if (message || stopReason === "error") {
      return message ?? "Pi node runner reported a model error.";
    }
  }
  return null;
}

function objectValue(value: object, key: string): Record<string, unknown> | null {
  const entry = (value as Record<string, unknown>)[key];
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? entry as Record<string, unknown>
    : null;
}

function objectName(value: object, key: string): string | null {
  const entry = objectValue(value, key);
  return entry ? readString(entry, "name") : null;
}

function readString(value: object, key: string): string | null {
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" && entry.length > 0 ? entry : null;
}

function numberValue(value: object, key: string): number | null {
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "number" && Number.isFinite(entry) ? entry : null;
}
