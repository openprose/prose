import { PiGraphRuntime } from "./pi/graph-vm.js";
import type { RuntimeProvider } from "../providers/index.js";
import type { NodeExecutionRequest } from "./node-request.js";
import type { NodeExecutionResult } from "./node-result.js";

export interface ReactiveGraphRuntime {
  kind: string;
  executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult>;
}

export function createReactiveGraphRuntime(options: {
  provider: RuntimeProvider;
}): ReactiveGraphRuntime {
  if (options.provider.kind === "pi") {
    return new PiGraphRuntime(options.provider);
  }
  return new ProviderBackedGraphRuntime(options.provider);
}

class ProviderBackedGraphRuntime implements ReactiveGraphRuntime {
  readonly kind: string;

  constructor(private readonly provider: RuntimeProvider) {
    this.kind = provider.kind;
  }

  async executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    const providerResult = await this.provider.execute(request.provider_request);
    return {
      node_execution_result_version: "0.1",
      run_id: request.run_id,
      component_ref: request.component_ref,
      graph_vm: this.kind,
      runtime_profile: request.runtime_profile,
      provider_result: providerResult,
    };
  }
}
