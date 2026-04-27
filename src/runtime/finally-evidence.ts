import { isAbsolute, normalize } from "node:path";
import type { Diagnostic, FinallyEvidenceRecord } from "../types.js";
import type { NodeRunRequest } from "../node-runners/protocol.js";

export function normalizeFinallyEvidence(
  value: unknown,
  toolName: string,
): FinallyEvidenceRecord | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${toolName} payload.finally must be a JSON object.`);
  }
  const record = value as Record<string, unknown>;
  return {
    summary: normalizeNullableString(record.summary),
    state_refs: normalizeStringList(record.state_refs),
    cleanup_performed: normalizeStringList(record.cleanup_performed),
    unresolved: normalizeStringList(record.unresolved),
  };
}

export function missingFinallyEvidenceDiagnostic(
  request: NodeRunRequest,
  toolName: string,
): Diagnostic | null {
  if (!request.component.finally) {
    return null;
  }
  return {
    severity: "warning",
    code: "openprose_finally_evidence_missing",
    message: `${toolName} did not include finally evidence for this component's Finally section.`,
    source_span: request.component.finally.source_span,
  };
}

export function validateFinallyEvidenceStateRefs(
  request: NodeRunRequest,
  evidence: FinallyEvidenceRecord | null,
  toolName: string,
  diagnostics: Diagnostic[],
): void {
  for (const ref of evidence?.state_refs ?? []) {
    if (validStateRef(ref)) {
      continue;
    }
    diagnostics.push({
      severity: "error",
      code: "openprose_finally_evidence_invalid_state_ref",
      message: `${toolName} finally state ref '${ref}' must be workspace-relative and stay inside the node workspace.`,
      source_span: request.component.finally?.source_span ?? request.component.source.span,
    });
  }
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
