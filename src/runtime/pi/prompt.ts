import {
  buildNodePromptEnvelope,
  renderNodePromptEnvelope,
  type NodePromptEnvelope,
} from "../node-envelope.js";
import {
  renderNodeOutputFileInstructions,
  type NodeOutputFileMap,
} from "../../node-runners/output-files.js";
import type { NodeExecutionRequest } from "../node-request.js";

export function buildPiNodePromptEnvelope(
  request: NodeExecutionRequest,
): NodePromptEnvelope {
  return buildNodePromptEnvelope(request);
}

export function renderPiNodePrompt(
  request: NodeExecutionRequest,
  outputFiles?: NodeOutputFileMap,
): string {
  const envelope = buildPiNodePromptEnvelope(request);
  return [
    renderNodePromptEnvelope(envelope),
    "",
    "## Output Submission",
    "",
    "If the openprose_submit_outputs tool is available, use it to submit declared outputs and performed effects.",
    "If the node reaches a declared terminal failure, use openprose_report_error instead of submitting placeholder outputs.",
    "If the component declares Finally obligations, include finally evidence in whichever terminal tool call you use.",
    "If the output tool is not available, write the fallback output files exactly as instructed below.",
    "",
    renderNodeOutputFileInstructions(
      request.node_run_request.expected_outputs,
      outputFiles,
    ),
  ].join("\n");
}
