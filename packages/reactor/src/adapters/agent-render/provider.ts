/**
 * OpenRouter provider wiring for the agent-render session (Phase 1, step 1).
 *
 * The Reactor render atom (architecture.md §1) is, at run time, one bounded
 * `@openai/agents` session. This module is the *provider* half of that adapter:
 * it points the SDK at OpenRouter's OpenAI-compatible Chat Completions surface so
 * `google/gemini-3.5-flash` can be driven cheaply and reproducibly, and exposes a
 * single flag-gated `smokeRun()` that proves the wiring end to end.
 *
 * Discipline (standing constraints + research/agents-sdk/05 §2.4):
 *   - SCOPED `OpenAIProvider` — no `setDefaultOpenAIClient` / `setOpenAIAPI`
 *     global mutation. `useResponses: false` forces the Chat Completions model
 *     per-provider (the Responses API 404s on OpenRouter).
 *   - `@openai/agents` + `zod` stay dev/optional. NOTHING here runs at import
 *     time except cheap pure helpers; the SDK is only touched inside the
 *     factory/smoke functions, and any live call is gated behind the presence of
 *     `OPENROUTER_API_KEY` (see `hasOpenRouterKey`).
 *   - Tracing is disabled before any live run (the exporter would otherwise POST
 *     to api.openai.com — an out-of-band network side-effect).
 */

import { readFileSync } from "node:fs";

import {
  Agent,
  OpenAIProvider,
  Runner,
  setTracingDisabled,
  type ModelProvider,
} from "@openai/agents";

// ---------------------------------------------------------------------------
// Constants — the decided OpenRouter / gemini wiring (research §0, §2.4, §4.1)
// ---------------------------------------------------------------------------

/** OpenRouter's OpenAI-compatible base. Chat Completions only; no `/responses`. */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** The render model. A bare string resolved by the scoped provider's getModel. */
export const DEFAULT_RENDER_MODEL = "google/gemini-3.5-flash";

/** Greedy decoding — determinism knob #1 (research §4.1). */
export const DEFAULT_TEMPERATURE = 0;

/** The provider label that rides into the receipt `Cost` (research §3, §4.2). */
export const OPENROUTER_PROVIDER_LABEL = "openrouter";

/** Default location of the env file holding `OPENROUTER_API_KEY`. */
export const DEFAULT_ENV_PATH = "/Users/sl/code/openprose/.env";

const OPENROUTER_API_KEY = "OPENROUTER_API_KEY";

// ---------------------------------------------------------------------------
// Env: read OPENROUTER_API_KEY without a dotenv dependency
// ---------------------------------------------------------------------------

/**
 * Resolve the OpenRouter API key. Prefers `process.env`, then falls back to a
 * minimal parse of the `.env` file at `envPath`. Returns `undefined` (never
 * throws) when absent, so callers can gate live behaviour on its presence.
 */
export function readOpenRouterKey(
  envPath: string = DEFAULT_ENV_PATH,
): string | undefined {
  const fromProcess = process.env[OPENROUTER_API_KEY];
  if (typeof fromProcess === "string" && fromProcess.length > 0) {
    return fromProcess;
  }
  const fromFile = readEnvValue(envPath, OPENROUTER_API_KEY);
  if (typeof fromFile === "string" && fromFile.length > 0) {
    return fromFile;
  }
  return undefined;
}

/** True when an OpenRouter key is available — the live-test / smoke gate. */
export function hasOpenRouterKey(envPath: string = DEFAULT_ENV_PATH): boolean {
  return readOpenRouterKey(envPath) !== undefined;
}

function readEnvValue(envPath: string, key: string): string | undefined {
  let contents: string;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return undefined;
  }
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const name = line.slice(0, eq).trim();
    if (name !== key) {
      continue;
    }
    return unquote(line.slice(eq + 1).trim());
  }
  return undefined;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

// ---------------------------------------------------------------------------
// Scoped provider — no global mutation
// ---------------------------------------------------------------------------

export interface OpenRouterProviderConfig {
  /** OpenRouter API key. Defaults to {@link readOpenRouterKey}. */
  readonly apiKey?: string;
  /** Base URL override. Defaults to {@link OPENROUTER_BASE_URL}. */
  readonly baseURL?: string;
  /** Path to the `.env` fallback. Defaults to {@link DEFAULT_ENV_PATH}. */
  readonly envPath?: string;
}

/**
 * Build a SCOPED `OpenAIProvider` pointed at OpenRouter on the Chat Completions
 * path. The provider lazily constructs its own OpenAI client from
 * `apiKey`/`baseURL` (openaiProvider.ts `#getClient`), so we never import the
 * `openai` package directly and never mutate the SDK's process-global default
 * client. `useResponses: false` selects `OpenAIChatCompletionsModel`.
 *
 * Throws only if no key can be resolved — callers that want the soft gate should
 * check {@link hasOpenRouterKey} first.
 */
export function createOpenRouterProvider(
  config: OpenRouterProviderConfig = {},
): ModelProvider {
  const apiKey = config.apiKey ?? readOpenRouterKey(config.envPath);
  if (apiKey === undefined) {
    throw new Error(
      `OpenRouter provider requires ${OPENROUTER_API_KEY}; none found in process.env or ${config.envPath ?? DEFAULT_ENV_PATH}`,
    );
  }
  return new OpenAIProvider({
    apiKey,
    baseURL: config.baseURL ?? OPENROUTER_BASE_URL,
    // Chat Completions, not Responses — per-provider, no global setOpenAIAPI.
    useResponses: false,
  });
}

// ---------------------------------------------------------------------------
// Flag-gated smoke run — proves the wiring against live gemini
// ---------------------------------------------------------------------------

export interface SmokeRunConfig extends OpenRouterProviderConfig {
  /** Model id. Defaults to {@link DEFAULT_RENDER_MODEL}. */
  readonly model?: string;
  /** Decoding temperature. Defaults to {@link DEFAULT_TEMPERATURE}. */
  readonly temperature?: number;
  /** Best-effort reproducibility seed, passed through `providerData.seed`. */
  readonly seed?: number;
  /** Prompt to send. Defaults to a trivial ping. */
  readonly input?: string;
  /** Pre-built provider (skips {@link createOpenRouterProvider}). */
  readonly provider?: ModelProvider;
}

export interface SmokeRunResult {
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly model: string;
}

/**
 * Run one bounded session against live OpenRouter gemini and return the text +
 * usage. Disables tracing first (otherwise the exporter POSTs to api.openai.com).
 * Uses a scoped `Runner({ modelProvider })` so nothing process-global is touched.
 *
 * GATING: callers MUST check {@link hasOpenRouterKey} (or pass an `apiKey`); this
 * function performs a real network call. It is invoked only from the live,
 * env-gated smoke test — never at import or in the offline build/test path.
 */
export async function smokeRun(
  config: SmokeRunConfig = {},
): Promise<SmokeRunResult> {
  setTracingDisabled(true);

  const model = config.model ?? DEFAULT_RENDER_MODEL;
  const temperature = config.temperature ?? DEFAULT_TEMPERATURE;
  const provider = config.provider ?? createOpenRouterProvider(config);

  const agent = new Agent({
    name: "reactor-render-smoke",
    instructions:
      "You are a connectivity probe for the Reactor render gateway. " +
      "Answer in the fewest words possible.",
    model,
    modelSettings: {
      temperature,
      ...(config.seed !== undefined
        ? { providerData: { seed: config.seed } }
        : {}),
    },
  });

  const runner = new Runner({ modelProvider: provider });
  const input = config.input ?? "Reply with the single word: ok";
  const result = await runner.run(agent, input);

  const usage = result.state.usage;
  return {
    text:
      typeof result.finalOutput === "string"
        ? result.finalOutput
        : String(result.finalOutput ?? ""),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    model,
  };
}
