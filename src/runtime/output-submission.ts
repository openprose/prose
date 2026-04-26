import { isAbsolute, normalize } from "node:path";
import { sha256 } from "../hash.js";
import { mergePolicyLabels } from "../policy/runtime.js";
import type { Diagnostic } from "../types.js";
import type {
  NodeArtifactResult,
  NodeExpectedOutput,
  NodeRunRequest,
} from "../node-runners/protocol.js";

export interface OutputSubmissionOutput {
  port: string;
  content?: string | null;
  artifact_ref?: string | null;
  content_type?: string | null;
  policy_labels?: string[];
  citations?: string[];
  notes?: string | null;
}

export interface OutputSubmissionPayload {
  outputs: OutputSubmissionOutput[];
  performed_effects?: string[];
  citations?: string[];
  notes?: string | null;
}

export interface OutputSubmissionResult {
  status: "accepted" | "rejected";
  artifacts: NodeArtifactResult[];
  performed_effects: string[];
  diagnostics: Diagnostic[];
  citations: string[];
  notes: string | null;
  payload: OutputSubmissionPayload | null;
}

export function evaluateOutputSubmission(
  request: NodeRunRequest,
  rawPayload: unknown,
): OutputSubmissionResult {
  const diagnostics: Diagnostic[] = [];
  let payload: OutputSubmissionPayload;

  try {
    payload = parseOutputSubmissionPayload(rawPayload);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "openprose_output_submission_malformed_json",
      message: error instanceof Error ? error.message : String(error),
      source_span: request.component.source.span,
    });
    return rejected(diagnostics);
  }

  validateOutputEntries(request, payload, diagnostics);
  validatePerformedEffects(request, payload, diagnostics);
  if (diagnostics.length > 0) {
    return {
      ...rejected(diagnostics),
      performed_effects: normalizeStringList(payload.performed_effects),
      citations: normalizeStringList(payload.citations),
      notes: normalizeNullableString(payload.notes),
      payload,
    };
  }

  return {
    status: "accepted",
    artifacts: artifactsFromSubmission(request, payload),
    performed_effects: normalizeStringList(payload.performed_effects),
    diagnostics: [],
    citations: normalizeStringList(payload.citations),
    notes: normalizeNullableString(payload.notes),
    payload,
  };
}

export function parseOutputSubmissionPayload(rawPayload: unknown): OutputSubmissionPayload {
  const parsed = typeof rawPayload === "string" ? parseJsonObject(rawPayload) : rawPayload;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("openprose_submit_outputs payload must be a JSON object.");
  }

  const outputs = (parsed as Record<string, unknown>).outputs;
  if (!Array.isArray(outputs)) {
    throw new Error("openprose_submit_outputs payload must include an outputs array.");
  }

  return {
    outputs: outputs.map((entry, index) => normalizeOutputEntry(entry, index)),
    performed_effects: normalizeStringList(
      (parsed as Record<string, unknown>).performed_effects,
    ),
    citations: normalizeStringList((parsed as Record<string, unknown>).citations),
    notes: normalizeNullableString((parsed as Record<string, unknown>).notes),
  };
}

function validateOutputEntries(
  request: NodeRunRequest,
  payload: OutputSubmissionPayload,
  diagnostics: Diagnostic[],
): void {
  const expectedByPort = new Map(
    request.expected_outputs.map((output) => [output.port, output]),
  );
  const submittedPorts = new Set<string>();

  for (const output of payload.outputs) {
    const expected = expectedByPort.get(output.port);
    if (!expected) {
      diagnostics.push({
        severity: "error",
        code: "openprose_output_submission_unknown_output",
        message: `openprose_submit_outputs submitted undeclared output '${output.port}'.`,
        source_span: request.component.source.span,
      });
      continue;
    }

    if (submittedPorts.has(output.port)) {
      diagnostics.push({
        severity: "error",
        code: "openprose_output_submission_duplicate_output",
        message: `openprose_submit_outputs submitted output '${output.port}' more than once.`,
        source_span: portSourceSpan(request, expected),
      });
      continue;
    }
    submittedPorts.add(output.port);

    if (typeof output.content !== "string") {
      diagnostics.push({
        severity: "error",
        code: "openprose_output_submission_content_missing",
        message: `openprose_submit_outputs output '${output.port}' must include string content.`,
        source_span: portSourceSpan(request, expected),
      });
    }

    if (!validArtifactRef(output.artifact_ref)) {
      diagnostics.push({
        severity: "error",
        code: "openprose_output_submission_invalid_artifact_ref",
        message: `openprose_submit_outputs output '${output.port}' has an invalid artifact_ref.`,
        source_span: portSourceSpan(request, expected),
      });
    }
  }

  for (const expected of request.expected_outputs) {
    if (!expected.required || submittedPorts.has(expected.port)) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "openprose_output_submission_required_output_missing",
      message: `openprose_submit_outputs did not include required output '${expected.port}'.`,
      source_span: portSourceSpan(request, expected),
    });
  }
}

function validatePerformedEffects(
  request: NodeRunRequest,
  payload: OutputSubmissionPayload,
  diagnostics: Diagnostic[],
): void {
  const declared = new Set(request.component.effects.map((effect) => effect.kind));
  for (const effect of normalizeStringList(payload.performed_effects)) {
    if (declared.has(effect)) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "openprose_output_submission_undeclared_effect",
      message: `openprose_submit_outputs reported undeclared effect '${effect}'.`,
      source_span: request.component.source.span,
    });
  }
}

function artifactsFromSubmission(
  request: NodeRunRequest,
  payload: OutputSubmissionPayload,
): NodeArtifactResult[] {
  const expectedByPort = new Map(
    request.expected_outputs.map((output) => [output.port, output]),
  );

  return payload.outputs.flatMap((output) => {
    const expected = expectedByPort.get(output.port);
    if (!expected || typeof output.content !== "string") {
      return [];
    }
    const content = normalizeTextArtifact(output.content);
    return [
      {
        port: output.port,
        content,
        content_type:
          normalizeNullableString(output.content_type) ??
          inferSubmissionContentType(expected),
        artifact_ref: normalizeNullableString(output.artifact_ref),
        content_hash: sha256(content),
        policy_labels: mergePolicyLabels(
          expected.policy_labels,
          normalizeStringList(output.policy_labels),
        ),
      },
    ];
  });
}

function normalizeOutputEntry(entry: unknown, index: number): OutputSubmissionOutput {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new Error(`openprose_submit_outputs outputs[${index}] must be an object.`);
  }
  const record = entry as Record<string, unknown>;
  const port = normalizeNullableString(record.port);
  if (!port) {
    throw new Error(`openprose_submit_outputs outputs[${index}].port must be a string.`);
  }
  return {
    port,
    content:
      typeof record.content === "string" || record.content === null
        ? record.content
        : undefined,
    artifact_ref: normalizeNullableString(record.artifact_ref),
    content_type: normalizeNullableString(record.content_type),
    policy_labels: normalizeStringList(record.policy_labels),
    citations: normalizeStringList(record.citations),
    notes: normalizeNullableString(record.notes),
  };
}

function parseJsonObject(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(
      `openprose_submit_outputs payload must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function rejected(diagnostics: Diagnostic[]): OutputSubmissionResult {
  return {
    status: "rejected",
    artifacts: [],
    performed_effects: [],
    diagnostics,
    citations: [],
    notes: null,
    payload: null,
  };
}

function normalizeStringList(values: unknown): string[] {
  if (!Array.isArray(values)) {
    return [];
  }
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function normalizeNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function validArtifactRef(value: string | null | undefined): boolean {
  if (!value) {
    return true;
  }
  const normalized = normalize(value).replace(/\\/g, "/");
  return !isAbsolute(value) && normalized !== "." && !normalized.startsWith("../");
}

function inferSubmissionContentType(output: NodeExpectedOutput): string {
  const type = output.type.toLowerCase();
  if (type.includes("json") || type.includes("record") || type.includes("object")) {
    return "application/json";
  }
  if (type.includes("text") || type === "string") {
    return "text/plain";
  }
  return "text/markdown";
}

function portSourceSpan(
  request: NodeRunRequest,
  output: NodeExpectedOutput,
): Diagnostic["source_span"] {
  return request.component.ports.ensures.find((port) => port.name === output.port)
    ?.source_span;
}

function normalizeTextArtifact(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
