import type { NodeExecutionRequest } from "./node-request.js";
import type { NodeExecutionResult } from "./node-result.js";
import type { ReactiveGraphRuntime } from "./graph-runtime.js";

export interface NodeExecutionDelegate {
  executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult>;
}

export interface DelegatedGraphRuntimeOptions {
  kind?: string;
  delegate: NodeExecutionDelegate;
}

export class DelegatedGraphRuntime implements ReactiveGraphRuntime {
  readonly kind: string;

  constructor(private readonly options: DelegatedGraphRuntimeOptions) {
    this.kind = options.kind ?? "pi";
  }

  async executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    const result = await this.options.delegate.executeNode(request);
    if (result.run_id !== request.run_id) {
      throw new Error(
        `Delegated node executor returned run_id '${result.run_id}' for request '${request.run_id}'.`,
      );
    }
    if (result.component_ref !== request.component_ref) {
      throw new Error(
        `Delegated node executor returned component_ref '${result.component_ref}' for request '${request.component_ref}'.`,
      );
    }
    return result;
  }
}

export function createDelegatedGraphRuntime(
  options: DelegatedGraphRuntimeOptions,
): DelegatedGraphRuntime {
  return new DelegatedGraphRuntime(options);
}

