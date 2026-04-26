import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RuntimeProvider } from "../../providers/index.js";
import { buildPiNodePromptEnvelope, renderPiNodePrompt } from "./prompt.js";
import type { NodeExecutionRequest } from "../node-request.js";
import type { NodeExecutionResult } from "../node-result.js";
import type { RuntimeProfile } from "../../types.js";

export class PiGraphRuntime {
  readonly kind = "pi";

  constructor(private readonly provider: RuntimeProvider) {}

  async executeNode(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    assertPiProfile(request.runtime_profile);
    const envelope = buildPiNodePromptEnvelope(request);
    await writeNodeEnvelope(request, envelope);
    const providerRequest = {
      ...request.provider_request,
      runtime_prompt: {
        prompt_version: "0.1" as const,
        kind: "node_envelope" as const,
        text: renderPiNodePrompt(request),
      },
    };
    const providerResult = await this.provider.execute(providerRequest);
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

async function writeNodeEnvelope(
  request: NodeExecutionRequest,
  envelope: ReturnType<typeof buildPiNodePromptEnvelope>,
): Promise<void> {
  const path = join(request.workspace_path, "openprose-node-envelope.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");
}

function assertPiProfile(profile: RuntimeProfile): void {
  if (profile.graph_vm !== "pi") {
    throw new Error(
      `Pi graph runtime cannot execute graph VM '${profile.graph_vm}'.`,
    );
  }
}
