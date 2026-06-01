/**
 * A minimal fake `ModelProvider` for the OFFLINE compile gate — the CLI's own
 * copy of the SDK's compile-session fake (which lives under the SDK's `__tests__`
 * and is not shipped in `dist`). The fake model always replies with a canned JSON
 * string as one completed assistant message; the SDK runs the agent's injected
 * zod `outputType.parse` over it, yielding a validated `finalOutput`. No network,
 * no key. This file is TEST-ONLY (never reachable from the offline entrypoint),
 * so importing `@openai/agents` here does not violate the N2 boundary.
 */

import { Usage, type Model, type ModelProvider, type ModelResponse } from '@openai/agents';

/** A fake provider that replies with `responseJson` for every model call. */
export function fakeStructuredProvider(
  responseJson: string,
  inputTokens = 100,
  outputTokens = 20,
): ModelProvider {
  const model: Model = {
    async getResponse(): Promise<ModelResponse> {
      const usage = new Usage({
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      });
      return {
        usage,
        output: [
          {
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: responseJson }],
          },
        ],
      } as unknown as ModelResponse;
    },
    // eslint-disable-next-line require-yield
    async *getStreamedResponse() {
      throw new Error('fake model does not stream');
    },
  };
  return { getModel: () => model };
}
