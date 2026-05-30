import { deepEqual, equal } from "node:assert/strict";
import { test } from "node:test";

import {
  sumCachedTokens,
  usageToCost,
  usageToGatewayUsage,
  type RenderUsage,
} from "../cost";
import {
  DEFAULT_RENDER_MODEL,
  OPENROUTER_PROVIDER_LABEL,
} from "../provider";

test("usageToGatewayUsage: no cached details → fresh === input+output, reused 0", () => {
  // The live gemini-3.5-flash reality (step 1 probe): no prompt_tokens_details.
  const usage: RenderUsage = {
    inputTokens: 25,
    outputTokens: 128,
    totalTokens: 153,
  };
  deepEqual(usageToGatewayUsage(usage), {
    provider: OPENROUTER_PROVIDER_LABEL,
    model: DEFAULT_RENDER_MODEL,
    tokens: { fresh: 153, reused: 0 },
  });
});

test("sumCachedTokens: sums cached_tokens across detail records", () => {
  const usage: RenderUsage = {
    inputTokens: 100,
    outputTokens: 10,
    totalTokens: 110,
    inputTokensDetails: [{ cached_tokens: 30 }, { cached_tokens: 10 }],
  };
  equal(sumCachedTokens(usage), 40);
});

test("sumCachedTokens: honors camelCase cachedTokens, counts each record once", () => {
  const usage: RenderUsage = {
    inputTokens: 100,
    outputTokens: 0,
    totalTokens: 100,
    // Same datum under two spellings in one record → counted once (snake wins).
    inputTokensDetails: [{ cached_tokens: 20, cachedTokens: 20 }, { cachedTokens: 5 }],
  };
  equal(sumCachedTokens(usage), 25);
});

test("sumCachedTokens: ignores non-positive / non-number / missing entries", () => {
  const usage: RenderUsage = {
    inputTokens: 50,
    outputTokens: 0,
    totalTokens: 50,
    inputTokensDetails: [
      { cached_tokens: 0 },
      { reasoning_tokens: 9 } as Record<string, number>,
      {},
    ],
  };
  equal(sumCachedTokens(usage), 0);
});

test("usageToGatewayUsage: cached → reused, rest → fresh", () => {
  const usage: RenderUsage = {
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    inputTokensDetails: [{ cached_tokens: 30 }],
  };
  // reused = 30; fresh = (100-30) + 40 = 110
  deepEqual(usageToGatewayUsage(usage).tokens, { fresh: 110, reused: 30 });
});

test("usageToGatewayUsage: clamps over-reported cached to inputTokens", () => {
  const usage: RenderUsage = {
    inputTokens: 20,
    outputTokens: 5,
    totalTokens: 25,
    inputTokensDetails: [{ cached_tokens: 999 }],
  };
  // reused clamped to 20; fresh = (20-20) + 5 = 5
  deepEqual(usageToGatewayUsage(usage).tokens, { fresh: 5, reused: 20 });
});

test("usageToGatewayUsage: coerces NaN / fractional token counts to non-neg ints", () => {
  const usage: RenderUsage = {
    inputTokens: Number.NaN,
    outputTokens: 12.9,
    totalTokens: 0,
  };
  deepEqual(usageToGatewayUsage(usage).tokens, { fresh: 12, reused: 0 });
});

test("usageToCost: attaches surprise_cause from the wake, keeps provider/model", () => {
  const usage: RenderUsage = {
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
  };
  const cost = usageToCost(usage, "input");
  deepEqual(cost, {
    provider: OPENROUTER_PROVIDER_LABEL,
    model: DEFAULT_RENDER_MODEL,
    tokens: { fresh: 30, reused: 0 },
    surprise_cause: "input",
  });
});

test("usageToCost: surprise_cause threads each wake source", () => {
  const usage: RenderUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
  for (const src of ["self", "external", "input"] as const) {
    equal(usageToCost(usage, src).surprise_cause, src);
  }
});
