import {
  buildNodePromptEnvelope,
  renderNodePromptEnvelope,
  type NodePromptEnvelope,
} from "../node-envelope.js";
import {
  renderProviderOutputFileInstructions,
  type ProviderOutputFileMap,
} from "../../providers/output-files.js";
import type { NodeExecutionRequest } from "../node-request.js";

export function buildPiNodePromptEnvelope(
  request: NodeExecutionRequest,
): NodePromptEnvelope {
  return buildNodePromptEnvelope(request);
}

export function renderPiNodePrompt(
  request: NodeExecutionRequest,
  outputFiles?: ProviderOutputFileMap,
): string {
  const envelope = buildPiNodePromptEnvelope(request);
  return [
    renderNodePromptEnvelope(envelope),
    "",
    "## Output Submission",
    "",
    "If the openprose_submit_outputs tool is available, use it to submit declared outputs and performed effects.",
    "If that tool is not available, write the fallback output files exactly as instructed below.",
    "",
    renderProviderOutputFileInstructions(
      request.provider_request.expected_outputs,
      outputFiles,
    ),
  ].join("\n");
}
