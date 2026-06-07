// U10 — the real, messy-feed N=1 live run + cost reconciliation.
//
// STATUS IN THIS BUILD: **BLOCKED — no OPENROUTER_API_KEY in scope.** This build
// mints the deterministic, offline, report-grade headline (U1-U9). The live N=1
// dollar-grade ledger is the moat-builder but requires a real key + a bounded
// real feed; it is intentionally NOT fabricated here (risk R3: never relabel a
// synthetic ledger as measured).
//
// PROCEDURE (for the operator who holds the throwaway key), per PLAN U10:
//   1. PREFERRED feed: examples/agent-observatory with the real connectors.cjs
//      (~/.claude/projects/**/*.jsonl, fingerprint mtime:size, emit only changed
//      sessions). CAP the scan + max_turns (a full scan is unbounded).
//   2. export OPENROUTER_API_KEY=...   # reference by NAME only; never log/commit it
//      reactor compile && reactor serve   (or `reactor run` over a staged fixture)
//      -> a real <state-dir>/receipts.json with real provider/model labels.
//   3. Pin ONE render model in prereg.json: openrouter openai/gpt-5.4-mini
//      (Anthropic endpoints reject the agents-SDK structured output).
//   4. Cost reconciliation: pull OpenRouter /generation authoritative per-gen
//      cost; until reconciled, LEAD WITH THE SKIP-HIT-RATE (the real unit
//      economic), carry a CostConfidence tier on every dollar, and surface the
//      gemini-no-prompt-cache caveat.
//   5. Commit the frozen ledger under runs/n1-<world>/; it must replay offline
//      via `reactor receipts cost --json` with ZERO further network (captured
//      once, never re-derived).

"use strict";

function hasKey() {
  return typeof process.env.OPENROUTER_API_KEY === "string" && process.env.OPENROUTER_API_KEY.length > 0;
}

function runLiveN1() {
  if (!hasKey()) {
    return {
      status: "blocked",
      reason: "OPENROUTER_API_KEY not present; refusing to fabricate a live ledger (risk R3).",
      lead_metric: "skip-hit-rate (the real unit economic) — NOT reuse-% (0% on the default model).",
      procedure: "see src/live/run.cjs header + PLAN U10",
    };
  }
  // A real implementation would drive `reactor compile && reactor serve` over the
  // capped agent-observatory feed here. Intentionally not auto-run: the live cell
  // stays off default CI (nascent-harness 6) and is operator-initiated.
  throw new Error(
    "Live N=1 run is operator-initiated, not auto-run from the offline suite. " +
      "Follow the procedure in this file's header with the key set.",
  );
}

module.exports = { runLiveN1, hasKey };
