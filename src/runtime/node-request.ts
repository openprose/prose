import type { ProviderRequest } from "../providers/index.js";
import type { ComponentIR, RuntimeProfile } from "../types.js";

export interface NodeExecutionRequest {
  node_execution_request_version: "0.1";
  run_id: string;
  graph_run_id: string;
  component_ref: string;
  component: ComponentIR;
  workspace_path: string;
  runtime_profile: RuntimeProfile;
  provider_request: ProviderRequest;
}

export function createNodeExecutionRequest(options: {
  graphRunId: string;
  runId: string;
  component: ComponentIR;
  workspacePath: string;
  runtimeProfile: RuntimeProfile;
  providerRequest: ProviderRequest;
}): NodeExecutionRequest {
  return {
    node_execution_request_version: "0.1",
    run_id: options.runId,
    graph_run_id: options.graphRunId,
    component_ref: options.component.name,
    component: options.component,
    workspace_path: options.workspacePath,
    runtime_profile: options.runtimeProfile,
    provider_request: {
      ...options.providerRequest,
      workspace_path: options.workspacePath,
      runtime_profile: options.runtimeProfile,
    },
  };
}
