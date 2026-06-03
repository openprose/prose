/**
 * The keyless provider PLAN — how `reactor.yml`'s `model:` block maps to a live
 * OpenAI-compatible endpoint, WITHOUT touching `@openai/agents`.
 *
 * OFFLINE-SAFE (N2): this module is pure data + string logic. It is imported from
 * the offline command handlers (`compile`/`run`/`serve`) at load scope, so it MUST
 * NOT static-import any model-bearing dependency. The actual `ModelProvider` is
 * built from this plan behind the dynamic-import boundary (see `live-provider.ts`).
 *
 * The plan answers two questions the handlers need keylessly:
 *   1. WHICH endpoint + key env does the configured provider resolve to?
 *   2. Is this the DEFAULT OpenRouter path (let the SDK build it lazily, unchanged)
 *      or a CUSTOM path the CLI must build + inject itself?
 */

/** A resolved provider plan: the endpoint + key env + whether the CLI builds it. */
export interface ProviderPlan {
  /** The normalized provider label (e.g. `openrouter`, `anthropic`, `custom`). */
  readonly provider: string;
  /** The OpenAI-compatible base URL the live provider points at. */
  readonly baseURL: string;
  /** The env var (and `.env` key) carrying this provider's API key. */
  readonly apiKeyEnv: string;
  /**
   * True when the CLI must construct + inject the provider itself (any non-default
   * provider, or an explicit `base_url`/`api_key_env` override). False is the
   * untouched default: OpenRouter with no overrides, where the SDK builds the
   * scoped provider lazily from `OPENROUTER_API_KEY` exactly as before.
   */
  readonly custom: boolean;
}

/** The `model:` fields this resolver reads (a structural subset of ModelConfig). */
export interface ProviderPlanInput {
  readonly provider: string;
  readonly base_url?: string;
  readonly api_key_env?: string;
}

interface KnownProvider {
  readonly baseURL: string;
  readonly apiKeyEnv: string;
}

/**
 * The built-in OpenAI-compatible surfaces. Every one of these speaks Chat
 * Completions, the surface the live provider selects (`useResponses: false`). Add
 * a row here as new vendors are asked for in the wild; an unknown provider is
 * still reachable by setting `base_url` + `api_key_env` explicitly.
 */
const KNOWN_PROVIDERS: Readonly<Record<string, KnownProvider>> = Object.freeze({
  openrouter: {
    baseURL: 'https://openrouter.ai/api/v1',
    apiKeyEnv: 'OPENROUTER_API_KEY',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1/',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
  },
  google: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    apiKeyEnv: 'GEMINI_API_KEY',
  },
});

/** The provider labels the CLI knows out of the box (for error guidance). */
export const KNOWN_PROVIDER_NAMES: readonly string[] = Object.freeze(
  Object.keys(KNOWN_PROVIDERS),
);

/**
 * Resolve the {@link ProviderPlan} for a `model:` config block. A known provider
 * supplies its base URL + key env; `base_url` / `api_key_env` override either,
 * which is also how you point at an unknown vendor (set both). Throws a legible,
 * actionable error when the provider is unknown AND not fully specified.
 */
export function resolveProviderPlan(input: ProviderPlanInput): ProviderPlan {
  const label = (input.provider || 'openrouter').trim().toLowerCase();
  const known = KNOWN_PROVIDERS[label];

  const baseURL = input.base_url ?? known?.baseURL;
  const apiKeyEnv = input.api_key_env ?? known?.apiKeyEnv;

  if (baseURL === undefined || apiKeyEnv === undefined) {
    throw new Error(
      `reactor: unknown model.provider '${input.provider}'. Use a built-in provider ` +
        `(${KNOWN_PROVIDER_NAMES.join(', ')}) in reactor.yml, or set BOTH model.base_url ` +
        `and model.api_key_env to point at any OpenAI-compatible endpoint. ` +
        `${baseURL === undefined ? 'Missing base_url. ' : ''}` +
        `${apiKeyEnv === undefined ? 'Missing api_key_env.' : ''}`.trim(),
    );
  }

  // The DEFAULT path = OpenRouter with no explicit overrides. Leave it to the SDK
  // (the scoped lazy provider, unchanged byte-for-byte). Anything else, the CLI
  // builds + injects so the configured key env actually gets read.
  const custom =
    label !== 'openrouter' ||
    input.base_url !== undefined ||
    input.api_key_env !== undefined;

  return { provider: label, baseURL, apiKeyEnv, custom };
}

/**
 * The actionable "configured provider needs a key" message. Names the EXACT env
 * var so a stranger who set, say, `ANTHROPIC_API_KEY` (but mistyped it, or set the
 * wrong one) is pointed at the right variable, never misdirected to OpenRouter.
 * Shared by `compile`/`run`/`serve` so the guidance is identical everywhere.
 */
export function missingProviderKeyHint(plan: ProviderPlan): string {
  return (
    `the configured '${plan.provider}' provider needs ${plan.apiKeyEnv}, but none was ` +
    `found in the environment or a discoverable .env. Set ${plan.apiKeyEnv}, or change ` +
    `model.provider / model.api_key_env in reactor.yml. (Run \`reactor doctor\` to check ` +
    `key presence without printing it; the keyless \`reactor-devtools\` replay needs no key.)`
  );
}
