/**
 * Render cost projection (Phase 1, step 2) — the SDK's run `Usage` → the
 * receipt `Cost`, via the port-blessed `ReactorModelGatewayUsage` +
 * `toReceiptCost` vocabulary (research/agents-sdk/05 §2.5, §4.2).
 *
 * The reactor's `Tokens` shape splits a render's spend into **fresh** vs
 * **reused** to make "cost scales with surprise" observable (shapes `Cost`;
 * world-model.md §4). This module pins the ONE token mapping the design left as
 * an open decision (05 §6.6, §4.2):
 *
 *   - `reused`  ← cached / prompt-cache input tokens, summed out of
 *                 `usage.inputTokensDetails` (the SDK's per-request cached-token
 *                 records — `usage.ts:122`). OpenRouter/OpenAI report cached
 *                 input tokens there; gemini-3.5-flash commonly reports none, in
 *                 which case `reused === 0` and `fresh === total` (the live
 *                 probe in step 1 confirmed no `prompt_tokens_details`).
 *   - `fresh`   ← every non-cached token: `(inputTokens − cached) + outputTokens`.
 *
 * `surprise_cause` is NOT known to the SDK — it is the wake source, supplied by
 * the render context (`ctx.wake.source`), exactly as `toReceiptCost`'s contract
 * states. The provider/model labels are the decided OpenRouter/gemini wiring.
 *
 * This module is pure and synchronous; it imports the SDK only for the `Usage`
 * *type* (erased at build, no runtime require), so it never trips the
 * offline-build guard.
 */

import type { Usage } from "@openai/agents";

import type { Cost, WakeSource } from "../../shapes";
import {
  toReceiptCost,
  type ReactorModelGatewayUsage,
} from "../types";
import {
  DEFAULT_RENDER_MODEL,
  OPENROUTER_PROVIDER_LABEL,
} from "./provider";

/**
 * The cached-token keys an `inputTokensDetails` record may carry. OpenAI reports
 * `cached_tokens`; the SDK's normalizer also surfaces a camelCase `cachedTokens`
 * on some providers. We sum whichever is present per record (never both — they
 * are the same datum under two spellings, so prefer the snake_case wire field).
 */
const CACHED_TOKEN_KEYS = ["cached_tokens", "cachedTokens"] as const;

/**
 * The minimal `Usage` surface this projection reads. Declared structurally so
 * the mapper is testable with a plain object (no need to construct a real SDK
 * `Usage`), while still accepting a genuine `Usage` instance at the call site.
 */
export interface RenderUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly inputTokensDetails?: ReadonlyArray<Readonly<Record<string, number>>>;
}

/**
 * Sum the cached (prompt-cache) input tokens across all per-request usage
 * records. Defensive against missing/partial details (gemini-3.5-flash reports
 * none): returns 0 when no cached entries are present. Never exceeds
 * `inputTokens` in the natural case, but we clamp in {@link usageToCost} rather
 * than here so this stays a pure sum.
 */
export function sumCachedTokens(usage: RenderUsage): number {
  const details = usage.inputTokensDetails;
  if (details === undefined) {
    return 0;
  }
  let cached = 0;
  for (const record of details) {
    for (const key of CACHED_TOKEN_KEYS) {
      const value = record[key];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        cached += value;
        break; // same datum under two spellings — count once per record
      }
    }
  }
  return cached;
}

/**
 * Build the `ReactorModelGatewayUsage` the cost vocabulary blesses from a run's
 * `Usage`, pinning the fresh/reused split:
 *   reused = min(cached, inputTokens)        (cached input tokens, clamped)
 *   fresh  = (inputTokens − reused) + outputTokens
 * Output tokens are always fresh (never cached). The clamp guards against a
 * provider over-reporting cached tokens beyond the input total — `Tokens`
 * requires non-negative integers (adapters/types.ts assertion).
 */
export function usageToGatewayUsage(
  usage: RenderUsage,
): ReactorModelGatewayUsage {
  const input = nonNegInt(usage.inputTokens);
  const output = nonNegInt(usage.outputTokens);
  const reused = Math.min(sumCachedTokens(usage), input);
  const fresh = input - reused + output;
  return {
    provider: OPENROUTER_PROVIDER_LABEL,
    model: DEFAULT_RENDER_MODEL,
    tokens: { fresh, reused },
  };
}

/**
 * Project a render's `Usage` + the wake's surprise cause into the receipt
 * `Cost`. The single cost entry point the agent-render mapper calls (05 §2.5).
 */
export function usageToCost(
  usage: RenderUsage,
  surprise_cause: WakeSource,
): Cost {
  return toReceiptCost(usageToGatewayUsage(usage), surprise_cause);
}

/** Coerce a possibly-fractional/NaN token count to a non-negative integer. */
function nonNegInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

// A compile-time check that a real SDK `Usage` satisfies `RenderUsage` — keeps
// the structural surface honest against SDK drift (e.g. if `inputTokensDetails`
// ever stops being an array of number-records). Type-only, emits no runtime artifact.
type _Assert = Usage extends RenderUsage ? true : never;
