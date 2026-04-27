import { defineTool } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
  evaluateOutputSubmission,
  type OutputSubmissionResult,
} from "../output-submission.js";
import type { PiCustomToolDefinition } from "../../node-runners/pi.js";
import type { NodeRunRequest } from "../../node-runners/protocol.js";

export type OutputSubmissionCollector = (result: OutputSubmissionResult) => void;

export interface OpenProseSubmitOutputsDetails {
  status: OutputSubmissionResult["status"];
  artifact_ports: string[];
  performed_effects: string[];
  finally: OutputSubmissionResult["finally"];
  diagnostics: Array<{ code: string; message: string }>;
  citations: string[];
  notes: string | null;
}

export const OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME = "openprose_submit_outputs";

const outputSubmissionParameters = Type.Object({
  outputs: Type.Array(
    Type.Object({
      port: Type.String({
        description: "Declared output port name.",
      }),
      content: Type.Optional(
        Type.String({
          description: "The complete artifact content for this declared output.",
        }),
      ),
      artifact_ref: Type.Optional(
        Type.String({
          description:
            "Optional workspace-relative artifact path hint. The submitted content remains authoritative.",
        }),
      ),
      content_type: Type.Optional(
        Type.String({
          description: "Optional MIME type for the artifact content.",
        }),
      ),
      policy_labels: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional policy labels propagated to this output.",
        }),
      ),
      citations: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional source citations for this output.",
        }),
      ),
      notes: Type.Optional(
        Type.String({
          description: "Optional implementation notes for this output.",
        }),
      ),
    }),
    {
      description: "Declared OpenProse outputs produced by this node.",
    },
  ),
  performed_effects: Type.Optional(
    Type.Array(Type.String(), {
      description: "Declared OpenProse effects actually performed by this node.",
    }),
  ),
  finally: Type.Optional(
    Type.Object({
      summary: Type.Optional(
        Type.String({
          description: "What was still guaranteed or cleaned up before completing.",
        }),
      ),
      state_refs: Type.Optional(
        Type.Array(Type.String(), {
          description: "Workspace-relative private-state refs that support finalization evidence.",
        }),
      ),
      cleanup_performed: Type.Optional(
        Type.Array(Type.String(), {
          description: "Cleanup or finalization actions performed before completing.",
        }),
      ),
      unresolved: Type.Optional(
        Type.Array(Type.String(), {
          description: "Finalization obligations that remain unresolved.",
        }),
      ),
    }),
  ),
  citations: Type.Optional(
    Type.Array(Type.String(), {
      description: "Run-level citations for the submitted outputs.",
    }),
  ),
  notes: Type.Optional(
    Type.String({
      description: "Run-level notes about the submitted outputs.",
    }),
  ),
});

type OutputSubmissionParameters = typeof outputSubmissionParameters;

export function createOpenProseSubmitOutputsTool(
  request: NodeRunRequest,
  collect: OutputSubmissionCollector,
): ToolDefinition<OutputSubmissionParameters, OpenProseSubmitOutputsDetails> &
  PiCustomToolDefinition {
  return defineTool({
    name: OPENPROSE_SUBMIT_OUTPUTS_TOOL_NAME,
    label: "Submit OpenProse Outputs",
    description:
      "Submit the final declared OpenProse outputs and performed effects for the current graph node.",
    promptSnippet:
      "Submit final declared OpenProse outputs with openprose_submit_outputs.",
    promptGuidelines: [
      "Use openprose_submit_outputs as the final action once every required output is ready.",
      "Submit only declared outputs; do not invent output ports.",
      "Include performed_effects only for effects declared by this OpenProse component.",
      "Include finally evidence when the component declares Finally obligations.",
      "After openprose_submit_outputs, do not emit another assistant response in the same turn.",
    ],
    parameters: outputSubmissionParameters,
    async execute(_toolCallId, params) {
      const result = evaluateOutputSubmission(request, params);
      collect(result);
      return {
        content: [
          {
            type: "text",
            text:
              result.status === "accepted"
                ? `Accepted OpenProse outputs: ${result.artifacts
                    .map((artifact) => artifact.port)
                    .join(", ")}`
                : `Rejected OpenProse outputs: ${result.diagnostics
                    .map((diagnostic) => diagnostic.message)
                    .join(" ")}`,
          },
        ],
        details: {
          status: result.status,
          artifact_ports: result.artifacts.map((artifact) => artifact.port).sort(),
          performed_effects: result.performed_effects,
          finally: result.finally,
          diagnostics: result.diagnostics.map((diagnostic) => ({
            code: diagnostic.code,
            message: diagnostic.message,
          })),
          citations: result.citations,
          notes: result.notes,
        },
        terminate: result.status === "accepted",
      };
    },
  });
}
