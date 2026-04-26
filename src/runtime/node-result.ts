import type { NodeRunResult } from "../node-runners/index.js";
import type { RuntimeProfile } from "../types.js";

export interface NodeExecutionResult {
  node_execution_result_version: "0.1";
  run_id: string;
  component_ref: string;
  graph_vm: string;
  runtime_profile: RuntimeProfile;
  node_run_result: NodeRunResult;
}
