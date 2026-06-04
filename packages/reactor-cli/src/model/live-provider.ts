/**
 * The MODEL-BEARING live-provider factory — build a scoped `@openai/agents`
 * `ModelProvider` from a keyless {@link ProviderPlan}.
 *
 * N2 OFFLINE BOUNDARY: this module static-imports `@openai/agents` (and, for the
 * native Anthropic path, the AI-SDK adapter). It is reached ONLY from modules that
 * are themselves behind the dynamic-import boundary (`run-compile.ts`,
 * `load-run-project.ts`, and doctor's `--live` smoke), never from the offline
 * command entrypoints. The handlers compute the keyless {@link ProviderPlan} and
 * read the key (both offline-safe), then cross the boundary and call this to mint
 * the provider.
 *
 * Two transports (see {@link ProviderPlan.transport}):
 *   - `openai-compat`    — a scoped `OpenAIProvider` on the Chat Completions path
 *                          (OpenRouter, OpenAI, Google, any custom `base_url`).
 *   - `anthropic-native` — the AI-SDK adapter over `@ai-sdk/anthropic`, hitting
 *                          Anthropic's native Messages API. This is the SUPPORTED
 *                          Claude path: Anthropic's OpenAI-compat endpoint is
 *                          "for testing, not production" and ignores
 *                          `response_format`, so it rejects our JSON-schema
 *                          structured outputs (`400 …json_schema.strict`). The
 *                          native adapter speaks the Messages API, where
 *                          structured outputs + tools work.
 */

import { OpenAIProvider, type Model, type ModelProvider } from '@openai/agents';
import { aisdk } from '@openai/agents-extensions/ai-sdk';
import { createAnthropic } from '@ai-sdk/anthropic';

import type { ProviderPlan } from './provider-plan';

/** The default Anthropic model when an agent carries no explicit model id. */
const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-4-5';

/**
 * Build a scoped `ModelProvider` for the plan + key. Dispatches on the plan's
 * transport; both paths are SCOPED (never `setDefaultOpenAIClient`), so two
 * reactors in one process can target two different vendors, mirroring the SDK's
 * own discipline.
 */
export function buildLiveProvider(
  plan: ProviderPlan,
  apiKey: string,
): ModelProvider {
  if (plan.transport === 'anthropic-native') {
    return buildAnthropicNativeProvider(plan, apiKey);
  }
  return buildOpenAICompatProvider(plan, apiKey);
}

/**
 * The OpenAI-compatible path. `useResponses: false` selects Chat Completions —
 * the surface OpenRouter, OpenAI, Google (and custom gateways) implement; the
 * Responses API is OpenAI-only and 404s elsewhere.
 */
function buildOpenAICompatProvider(
  plan: ProviderPlan,
  apiKey: string,
): ModelProvider {
  return new OpenAIProvider({
    apiKey,
    baseURL: plan.baseURL,
    useResponses: false,
  });
}

/**
 * The native Anthropic path: wrap `@ai-sdk/anthropic` in the `@openai/agents`
 * AI-SDK adapter and expose it as a `ModelProvider`. The harness keeps its
 * instruction composition, tools, harvest, and cost capture — only the model
 * session is swapped to the Messages API. Models are cached per id so repeated
 * renders reuse one adapter instance. An explicit `base_url` (a proxy) is honored;
 * otherwise the adapter uses its own Messages API base.
 */
function buildAnthropicNativeProvider(
  plan: ProviderPlan,
  apiKey: string,
): ModelProvider {
  const anthropic = createAnthropic({
    apiKey,
    ...(plan.baseURL.length > 0 ? { baseURL: plan.baseURL } : {}),
  });
  const cache = new Map<string, Model>();
  return {
    getModel(modelName?: string): Model {
      const id =
        modelName !== undefined && modelName.length > 0
          ? modelName
          : DEFAULT_ANTHROPIC_MODEL;
      let model = cache.get(id);
      if (model === undefined) {
        model = aisdk(anthropic(id)) as unknown as Model;
        cache.set(id, model);
      }
      return model;
    },
  };
}
