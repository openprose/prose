import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  evaluateErrorSubmission,
  type ErrorSubmissionResult,
} from "../error-submission.js";
import type { PiCustomToolDefinition } from "../../node-runners/pi.js";
import type { NodeRunRequest } from "../../node-runners/protocol.js";

export type ErrorSubmissionCollector = (result: ErrorSubmissionResult) => void;

export interface OpenProseReportErrorDetails {
  status: ErrorSubmissionResult["status"];
  code: string | null;
  retryable: boolean | null;
  state_refs: string[];
  performed_effects: string[];
  diagnostics: Array<{ code: string; message: string }>;
}

export const OPENPROSE_REPORT_ERROR_TOOL_NAME = "openprose_report_error";

const finallyEvidenceParameters = Type.Object({
  summary: Type.Optional(
    Type.String({
      description: "What was still guaranteed or cleaned up before failing.",
    }),
  ),
  state_refs: Type.Optional(
    Type.Array(Type.String(), {
      description: "Workspace-relative private-state refs that support finalization evidence.",
    }),
  ),
  cleanup_performed: Type.Optional(
    Type.Array(Type.String(), {
      description: "Cleanup or finalization actions performed before failing.",
    }),
  ),
  unresolved: Type.Optional(
    Type.Array(Type.String(), {
      description: "Finalization obligations that remain unresolved.",
    }),
  ),
});

const errorSubmissionParameters = Type.Object({
  code: Type.String({
    description: "Declared error code from this component's Errors section.",
  }),
  message: Type.String({
    description: "Human-readable terminal failure reason.",
  }),
  retryable: Type.Optional(
    Type.Boolean({
      description: "Whether retrying this node may reasonably succeed.",
    }),
  ),
  details: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Optional structured diagnostic details.",
    }),
  ),
  state_refs: Type.Optional(
    Type.Array(Type.String(), {
      description: "Workspace-relative private-state refs useful for post-analysis.",
    }),
  ),
  performed_effects: Type.Optional(
    Type.Array(Type.String(), {
      description: "Declared OpenProse effects actually performed before failure.",
    }),
  ),
  finally: Type.Optional(finallyEvidenceParameters),
});

type ErrorSubmissionParameters = typeof errorSubmissionParameters;

export function createOpenProseReportErrorTool(
  request: NodeRunRequest,
  collect: ErrorSubmissionCollector,
): ToolDefinition<ErrorSubmissionParameters, OpenProseReportErrorDetails> &
  PiCustomToolDefinition {
  return defineTool({
    name: OPENPROSE_REPORT_ERROR_TOOL_NAME,
    label: "Report OpenProse Error",
    description:
      "Report a declared terminal OpenProse error for the current graph node.",
    promptSnippet:
      "Report terminal declared failures with openprose_report_error.",
    promptGuidelines: [
      "Use openprose_report_error only for terminal failure modes declared in this node's Errors section.",
      "Do not use openprose_report_error for degraded success; submit an explicit declared output shape instead.",
      "Include performed_effects only for effects declared by this OpenProse component.",
      "Include private state refs when they help explain or reproduce the failure.",
      "Include finally evidence when the component declares Finally obligations.",
      "After an accepted openprose_report_error call, do not emit another assistant response in the same turn.",
    ],
    parameters: errorSubmissionParameters,
    async execute(_toolCallId, params) {
      const result = evaluateErrorSubmission(request, params);
      collect(result);
      return {
        content: [
          {
            type: "text",
            text:
              result.status === "accepted"
                ? `Accepted declared OpenProse error: ${result.error?.code}`
                : `Rejected declared OpenProse error: ${result.diagnostics
                    .map((diagnostic) => diagnostic.message)
                    .join(" ")}`,
          },
        ],
        details: {
          status: result.status,
          code: result.error?.code ?? result.payload?.code ?? null,
          retryable: result.error?.retryable ?? result.payload?.retryable ?? null,
          state_refs: result.error?.state_refs ?? result.payload?.state_refs ?? [],
          performed_effects: result.performed_effects,
          diagnostics: result.diagnostics.map((diagnostic) => ({
            code: diagnostic.code,
            message: diagnostic.message,
          })),
        },
        terminate: result.status === "accepted",
      };
    },
  });
}
