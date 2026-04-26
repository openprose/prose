import { PiGraphRuntime } from "./pi/graph-vm.js";
import type { NodeRunner } from "../node-runners/index.js";
import type { NodeExecutionRequest } from "./node-request.js";
import type { NodeExecutionResult } from "./node-result.js";

export interface ReactiveGraphRuntime {
  kind: string;
  executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult>;
}

export function createReactiveGraphRuntime(options: {
  nodeRunner: NodeRunner;
}): ReactiveGraphRuntime {
  if (options.nodeRunner.kind === "pi") {
    return new PiGraphRuntime(options.nodeRunner);
  }
  return new NodeRunnerBackedGraphRuntime(options.nodeRunner);
}

class NodeRunnerBackedGraphRuntime implements ReactiveGraphRuntime {
  readonly kind: string;

  constructor(private readonly nodeRunner: NodeRunner) {
    this.kind = nodeRunner.kind;
  }

  async executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    const nodeRunResult = await this.nodeRunner.execute(request.node_run_request);
    return {
      node_execution_result_version: "0.1",
      run_id: request.run_id,
      component_ref: request.component_ref,
      graph_vm: this.kind,
      runtime_profile: request.runtime_profile,
      node_run_result: nodeRunResult,
    };
  }
}
