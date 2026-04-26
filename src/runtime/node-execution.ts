import { readFile, writeFile } from "node:fs/promises";
import {
  resolveNodeRunner,
  type NodeRunner,
} from "../node-runners/index.js";
import { createReactiveGraphRuntime } from "./graph-runtime.js";
import type { NodeExecutionRequest } from "./node-request.js";
import type { NodeExecutionResult } from "./node-result.js";

export interface ExecuteNodeExecutionRequestOptions {
  nodeRunner?: NodeRunner;
}

export async function executeNodeExecutionRequest(
  request: NodeExecutionRequest,
  options: ExecuteNodeExecutionRequestOptions = {},
): Promise<NodeExecutionResult> {
  const nodeRunner =
    options.nodeRunner ??
    resolveNodeRunner({
      graphVm: request.runtime_profile.graph_vm,
      runtimeProfile: request.runtime_profile,
      deterministicOutputs: scriptedNodeOutputs(request),
    });
  const runtime = createReactiveGraphRuntime({ nodeRunner });
  return runtime.executeNode(request);
}

export async function executeNodeExecutionRequestFile(
  requestPath: string,
  options: ExecuteNodeExecutionRequestOptions & { outPath?: string | null } = {},
): Promise<NodeExecutionResult> {
  const request = JSON.parse(
    await readFile(requestPath, "utf8"),
  ) as NodeExecutionRequest;
  const result = await executeNodeExecutionRequest(request, options);
  if (options.outPath) {
    await writeFile(options.outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

function scriptedNodeOutputs(
  request: NodeExecutionRequest,
): Record<string, string> | undefined {
  if (
    request.runtime_profile.model_provider !== "scripted" ||
    request.runtime_profile.model !== "deterministic-output"
  ) {
    return undefined;
  }

  return Object.fromEntries(
    request.node_run_request.expected_outputs.map((output) => [
      output.port,
      scriptedOutputValue(request, output),
    ]),
  );
}

function scriptedOutputValue(
  request: NodeExecutionRequest,
  output: NodeExecutionRequest["node_run_request"]["expected_outputs"][number],
): string {
  const type = output.type.trim().toLowerCase();
  if (type.startsWith("json<") || type === "json") {
    return `${JSON.stringify({
      scripted: true,
      component: request.component.name,
      port: output.port,
    })}\n`;
  }
  if (type.startsWith("markdown<") || type === "markdown") {
    return [
      `# ${request.component.name} ${output.port}`,
      "",
      `Scripted distributed output for ${request.component.name}.${output.port}.`,
      "",
    ].join("\n");
  }
  return `${request.component.name}.${output.port}`;
}
