import type { RuntimeProvider } from "../../providers/index.js";
import type { NodeExecutionRequest } from "../node-request.js";
import type { NodeExecutionResult } from "../node-result.js";
import type { RuntimeProfile } from "../../types.js";

export class PiGraphRuntime {
  readonly kind = "pi";

  constructor(private readonly provider: RuntimeProvider) {}

  async executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    assertPiProfile(request.runtime_profile);
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

function assertPiProfile(profile: RuntimeProfile): void {
  if (profile.graph_vm !== "pi") {
    throw new Error(
      `Pi graph runtime cannot execute graph VM '${profile.graph_vm}'.`,
    );
  }
}
