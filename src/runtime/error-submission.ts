import { isAbsolute, normalize } from "node:path";
import {
  missingFinallyEvidenceDiagnostic,
  normalizeFinallyEvidence,
} from "./finally-evidence.js";
import type { DeclaredErrorRecord, Diagnostic } from "../types.js";
import type { NodeRunRequest } from "../node-runners/protocol.js";

export interface ErrorSubmissionFinallyEvidence {
  summary: string | null;
  state_refs: string[];
  cleanup_performed: string[];
  unresolved: string[];
}

export interface ErrorSubmissionPayload {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
  state_refs: string[];
  performed_effects: string[];
  finally: ErrorSubmissionFinallyEvidence | null;
}

export type DeclaredErrorReport = DeclaredErrorRecord;

export interface ErrorSubmissionResult {
  status: "accepted" | "rejected";
  error: DeclaredErrorRecord | null;
  performed_effects: string[];
  diagnostics: Diagnostic[];
  payload: ErrorSubmissionPayload | null;
}

export function evaluateErrorSubmission(
  request: NodeRunRequest,
  rawPayload: unknown,
): ErrorSubmissionResult {
  const diagnostics: Diagnostic[] = [];
  let payload: ErrorSubmissionPayload;

  try {
    payload = parseErrorSubmissionPayload(rawPayload);
  } catch (error) {
    diagnostics.push({
      severity: "error",
      code: "openprose_error_submission_malformed_json",
      message: error instanceof Error ? error.message : String(error),
      source_span: request.component.source.span,
    });
    return rejected(diagnostics);
  }

  const declaredError = validateDeclaredError(request, payload, diagnostics);
  validatePerformedEffects(request, payload, diagnostics);
  validateStateRefs(request, payload, diagnostics);

  if (diagnostics.some((diagnostic) => diagnostic.severity === "error") || !declaredError) {
    return {
      ...rejected(diagnostics),
      performed_effects: payload.performed_effects,
      payload,
    };
  }

  const errorReport: DeclaredErrorRecord = {
    code: payload.code,
    message: payload.message,
    declared: true,
    retryable: payload.retryable,
    details: payload.details,
    state_refs: payload.state_refs,
    performed_effects: payload.performed_effects,
    finally: payload.finally,
  };
  const finallyDiagnostic = payload.finally
    ? null
    : missingFinallyEvidenceDiagnostic(request, "openprose_report_error");
  if (finallyDiagnostic) {
    diagnostics.push(finallyDiagnostic);
  }

  return {
    status: "accepted",
    error: errorReport,
    performed_effects: payload.performed_effects,
    diagnostics: [
      {
        severity: "error",
        code: "openprose_declared_error",
        message: `openprose_report_error accepted declared error '${payload.code}': ${payload.message}`,
        source_span: declaredError.source_span ?? request.component.errors?.source_span,
      },
      ...diagnostics,
    ],
    payload,
  };
}

export function parseErrorSubmissionPayload(rawPayload: unknown): ErrorSubmissionPayload {
  const parsed = typeof rawPayload === "string" ? parseJsonObject(rawPayload) : rawPayload;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("openprose_report_error payload must be a JSON object.");
  }

  const record = parsed as Record<string, unknown>;
  const code = normalizeNullableString(record.code);
  if (!code) {
    throw new Error("openprose_report_error payload.code must be a string.");
  }
  const message = normalizeNullableString(record.message);
  if (!message) {
    throw new Error("openprose_report_error payload.message must be a string.");
  }

  return {
    code,
    message,
    retryable: normalizeRetryable(record.retryable),
    details: normalizeDetails(record.details),
    state_refs: normalizeStringList(record.state_refs),
    performed_effects: normalizeStringList(record.performed_effects),
    finally: normalizeFinallyEvidence(record.finally, "openprose_report_error"),
  };
}

function validateDeclaredError(
  request: NodeRunRequest,
  payload: ErrorSubmissionPayload,
  diagnostics: Diagnostic[],
): { source_span?: Diagnostic["source_span"] } | null {
  const declaredError = request.component.errors?.declarations.find(
    (error) => error.code === payload.code,
  );
  if (declaredError) {
    return declaredError;
  }

  diagnostics.push({
    severity: "error",
    code: "openprose_error_submission_undeclared_error",
    message: `openprose_report_error submitted undeclared error code '${payload.code}'.`,
    source_span: request.component.errors?.source_span ?? request.component.source.span,
  });
  return null;
}

function validatePerformedEffects(
  request: NodeRunRequest,
  payload: ErrorSubmissionPayload,
  diagnostics: Diagnostic[],
): void {
  const declared = new Set(request.component.effects.map((effect) => effect.kind));
  for (const effect of payload.performed_effects) {
    if (declared.has(effect)) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "openprose_error_submission_undeclared_effect",
      message: `openprose_report_error reported undeclared effect '${effect}'.`,
      source_span: request.component.source.span,
    });
  }
}

function validateStateRefs(
  request: NodeRunRequest,
  payload: ErrorSubmissionPayload,
  diagnostics: Diagnostic[],
): void {
  for (const ref of [
    ...payload.state_refs,
    ...(payload.finally?.state_refs ?? []),
  ]) {
    if (validStateRef(ref)) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "openprose_error_submission_invalid_state_ref",
      message: `openprose_report_error state ref '${ref}' must be workspace-relative and stay inside the node workspace.`,
      source_span: request.component.source.span,
    });
  }
}

function parseJsonObject(source: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(
      `openprose_report_error payload must be valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function rejected(diagnostics: Diagnostic[]): ErrorSubmissionResult {
  return {
    status: "rejected",
    error: null,
    performed_effects: [],
    diagnostics,
    payload: null,
  };
}

function normalizeRetryable(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new Error("openprose_report_error payload.retryable must be a boolean.");
  }
  return value;
}

function normalizeDetails(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("openprose_report_error payload.details must be a JSON object.");
  }
  return value as Record<string, unknown>;
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

function validStateRef(value: string): boolean {
  const normalized = normalize(value).replace(/\\/g, "/");
  return !isAbsolute(value) && normalized !== "." && !normalized.startsWith("../");
}
