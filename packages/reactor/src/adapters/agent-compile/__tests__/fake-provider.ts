// A minimal fake `ModelProvider` for the compile-session tests — returns a
// canned structured `finalOutput` so the WHOLE compile-session seam (instructions
// composed, contract-set evidence rendered, the agentic run, the zod `outputType`
// validation, usage → Cost) is exercised with NO network and NO key. This is the
// compile-phase analogue of the agent-render fake-provider proof.
//
// The fake `Model.getResponse` emits a single completed assistant message whose
// text is the JSON we want the agent to "have produced"; the SDK runs the agent's
// `outputType.parse` over it, yielding a validated `finalOutput`.

import {
  Usage,
  type Model,
  type ModelProvider,
  type ModelResponse,
} from "@openai/agents";

export interface FakeModelOptions {
  /** The token usage the run reports (drives the receipt Cost). */
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  /**
   * Observe each SDK `ModelRequest` before the canned reply — lets a test
   * assert what the session actually sends (e.g. `modelSettings.temperature`).
   */
  readonly onRequest?: (request: unknown) => void;
}

/**
 * Build a fake `ModelProvider` whose model always replies with `responseJson`
 * (a JSON string the agent's `outputType` will parse) as one assistant message.
 */
export function fakeStructuredProvider(
  responseJson: string,
  options: FakeModelOptions = {},
): ModelProvider {
  const inputTokens = options.inputTokens ?? 100;
  const outputTokens = options.outputTokens ?? 20;

  const model: Model = {
    async getResponse(request: unknown): Promise<ModelResponse> {
      options.onRequest?.(request);
      const usage = new Usage({
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      });
      return {
        usage,
        output: [
          {
            type: "message",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: responseJson }],
          },
        ],
      } as unknown as ModelResponse;
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error("fake model does not stream");
    },
  };

  return {
    getModel(): Model {
      return model;
    },
  };
}
