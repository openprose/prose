/**
 * The MODEL-BEARING live-provider factory — build a scoped `@openai/agents`
 * `ModelProvider` from a keyless {@link ProviderPlan}.
 *
 * N2 OFFLINE BOUNDARY: this module static-imports `@openai/agents`. It is reached
 * ONLY from modules that are themselves behind the dynamic-import boundary
 * (`run-compile.ts`, `load-run-project.ts`), never from the offline command
 * entrypoints. The handlers compute the keyless {@link ProviderPlan} and read the
 * key (both offline-safe), then cross the boundary and call this to mint the
 * provider.
 */

import { OpenAIProvider, type ModelProvider } from '@openai/agents';

import type { ProviderPlan } from './provider-plan';

/**
 * Build a SCOPED `OpenAIProvider` for the plan + key. `useResponses: false`
 * selects Chat Completions — the surface every built-in vendor (OpenRouter,
 * OpenAI, Anthropic, Google) implements; the Responses API is OpenAI-only and
 * 404s elsewhere. Scoped (never `setDefaultOpenAIClient`), so two reactors in one
 * process can target two different vendors, mirroring the SDK's own discipline.
 */
export function buildLiveProvider(
  plan: ProviderPlan,
  apiKey: string,
): ModelProvider {
  return new OpenAIProvider({
    apiKey,
    baseURL: plan.baseURL,
    useResponses: false,
  });
}
