import type { NodeRunRequest } from "../node-runners/index.js";
import type { ComponentIR, RuntimeProfile } from "../types.js";

export interface NodeExecutionRequest {
  node_execution_request_version: "0.1";
  run_id: string;
  graph_run_id: string;
  component_ref: string;
  component: ComponentIR;
  package: {
    name: string;
    source_ref: string;
    ir_hash: string;
  };
  planning: {
    requested_outputs: string[];
    stale_reasons: string[];
    current_run_id: string | null;
    recompute_scope: string;
  };
  workspace_path: string;
  runtime_profile: RuntimeProfile;
  node_run_request: NodeRunRequest;
}

export function createNodeExecutionRequest(options: {
  graphRunId: string;
  runId: string;
  component: ComponentIR;
  package: NodeExecutionRequest["package"];
  planning: NodeExecutionRequest["planning"];
  workspacePath: string;
  runtimeProfile: RuntimeProfile;
  nodeRunRequest: NodeRunRequest;
}): NodeExecutionRequest {
  return {
    node_execution_request_version: "0.1",
    run_id: options.runId,
    graph_run_id: options.graphRunId,
    component_ref: options.component.name,
    component: options.component,
    package: options.package,
    planning: options.planning,
    workspace_path: options.workspacePath,
    runtime_profile: options.runtimeProfile,
    node_run_request: {
      ...options.nodeRunRequest,
      workspace_path: options.workspacePath,
      runtime_profile: options.runtimeProfile,
    },
  };
}
