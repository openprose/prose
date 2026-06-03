// Cost LABELS — the receipt cost must report the provider + model that ACTUALLY
// ran, not a hardcoded "openrouter / gemini-3.5-flash". The labels are cost-only
// (never fingerprinted / never in the cache key), so stamping the truth is safe.

import { equal } from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_RENDER_MODEL,
  OPENROUTER_PROVIDER_LABEL,
} from "../provider";
import { usageToCost, usageToGatewayUsage } from "../cost";

const USAGE = {
  inputTokens: 100,
  outputTokens: 20,
  totalTokens: 120,
  inputTokensDetails: [],
} as const;

test("defaults to the OpenRouter / gemini labels when none are given (back-compat)", () => {
  const gw = usageToGatewayUsage(USAGE);
  equal(gw.provider, OPENROUTER_PROVIDER_LABEL);
  equal(gw.model, DEFAULT_RENDER_MODEL);
  const cost = usageToCost(USAGE, "external");
  equal(cost.provider, OPENROUTER_PROVIDER_LABEL);
  equal(cost.model, DEFAULT_RENDER_MODEL);
});

test("stamps the REAL provider + model when labels are supplied", () => {
  const gw = usageToGatewayUsage(USAGE, {
    provider: "anthropic",
    model: "claude-haiku-4-5",
  });
  equal(gw.provider, "anthropic");
  equal(gw.model, "claude-haiku-4-5");

  const cost = usageToCost(USAGE, "external", {
    provider: "anthropic",
    model: "claude-haiku-4-5",
  });
  equal(cost.provider, "anthropic");
  equal(cost.model, "claude-haiku-4-5");
  // The token math is unchanged by the labels.
  equal(cost.tokens.fresh, 120);
  equal(cost.tokens.reused, 0);
});

test("a partial label keeps the default for the unset field", () => {
  const onlyProvider = usageToGatewayUsage(USAGE, { provider: "openai" });
  equal(onlyProvider.provider, "openai");
  equal(onlyProvider.model, DEFAULT_RENDER_MODEL);

  const onlyModel = usageToGatewayUsage(USAGE, { model: "gpt-4o-mini" });
  equal(onlyModel.provider, OPENROUTER_PROVIDER_LABEL);
  equal(onlyModel.model, "gpt-4o-mini");
});
