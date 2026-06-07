// U1 — Deterministic offline cost seam.
//
// Offline fixtures return zeroCost (render-atom.ts:417), so an offline ledger
// has skip/render *disposition* but no fresh-token *magnitude* — yet the
// SURPRISE-COST metric is fresh-tokens-per-tick as f(lambda). This is the one
// genuinely-missing primitive: a deterministic, replay-stable `fresh` that is
// monotone in work done.
//
// The reconciler writes a zero-fresh `skipped` receipt automatically on a memo
// hit, so this function is only ever called on a RENDER. It does NOT mutate
// `zeroCost` or the shared commit() helpers (existing fixtures assert zero-cost
// skips). It returns a Cost satisfying validateCost: fresh/reused are
// non-negative safe integers and `surprise_cause === ctx.wake.source`.
//
// THE SURROGATE FORMULA (preregistered in prereg.json, U5 — so the slope is a
// credible proxy, not a tautology):
//
//   fresh  = ceil( (upstreamBytes + outputBytes) / CHARS_PER_TOKEN ) * workWeight
//   reused = floor( reusedContextBytes / CHARS_PER_TOKEN )
//
// where CHARS_PER_TOKEN = 4 (the standard ~4-chars/token surrogate) and
// `workWeight` distinguishes a mechanical gateway/normalizer (weight 0 -> a
// gateway costs no model tokens; it is a deterministic transform) from a
// model-bearing maintainer (weight 1). The surrogate is PURE in its byte inputs:
// byte-identical (upstreamBytes, outputBytes) always yield identical `fresh`,
// which is what makes the offline ledger replay-stable.

"use strict";

const CHARS_PER_TOKEN = 4;
const COST_MODEL_ID = "deterministic-cost-v1";

/**
 * @param {{ wake: { source: "input"|"self"|"external" } }} ctx  the render context
 * @param {{ upstreamBytes: number, outputBytes: number, reusedContextBytes?: number, workWeight?: number }} work
 * @returns {{ provider: string, model: string, tokens: { fresh: number, reused: number }, surprise_cause: string }}
 */
function deterministicCost(ctx, work) {
  const upstreamBytes = nonNegInt(work.upstreamBytes, "upstreamBytes");
  const outputBytes = nonNegInt(work.outputBytes, "outputBytes");
  const reusedContextBytes = nonNegInt(work.reusedContextBytes || 0, "reusedContextBytes");
  const workWeight = work.workWeight === undefined ? 1 : work.workWeight;

  const fresh = Math.ceil((upstreamBytes + outputBytes) / CHARS_PER_TOKEN) * workWeight;
  const reused = Math.floor(reusedContextBytes / CHARS_PER_TOKEN);

  return {
    provider: "deterministic",
    model: COST_MODEL_ID,
    tokens: { fresh, reused },
    surprise_cause: ctx.wake.source,
  };
}

function nonNegInt(v, name) {
  if (!Number.isFinite(v) || v < 0) {
    throw new Error(`deterministicCost: ${name} must be a non-negative finite number, got ${v}`);
  }
  return Math.floor(v);
}

/** The preregistered description of the surrogate (hashed into prereg.json). */
const SURROGATE_SPEC = Object.freeze({
  id: COST_MODEL_ID,
  chars_per_token: CHARS_PER_TOKEN,
  fresh: "ceil((upstreamBytes + outputBytes) / chars_per_token) * workWeight",
  reused: "floor(reusedContextBytes / chars_per_token)",
  workWeight: "0 for mechanical gateway/normalizer nodes, 1 for model-bearing maintainer nodes",
  note: "Pure in byte inputs; monotone non-decreasing in (upstreamBytes + outputBytes); a skip emits a zero-fresh receipt via the reconciler, never via this function.",
});

module.exports = { deterministicCost, SURROGATE_SPEC, CHARS_PER_TOKEN, COST_MODEL_ID };
