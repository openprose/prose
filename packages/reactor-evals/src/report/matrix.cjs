// U7 (b) — the regime -> comparator matrix, encoded in code (not prose). Each
// regime routes to its HONEST comparator; the report cannot silently claim a win
// against a baseline that is blind in that regime (baselines note 4.7, 6).

"use strict";

const REGIME_COMPARATORS = Object.freeze({
  "surprise-cost": {
    headline: true,
    comparators: ["oracle-cron", "no-memo-reactor"],
    note: "oracle-cron = flat-high yardstick; no-memo-reactor isolates the memo skip. content-cache TIES on cost in the busy regime -> NOT claimed as a win there.",
  },
  "silent-staleness": {
    headline: false,
    comparators: ["oracle-cron"],
    blind: ["content-cache"],
    note: "content-cache is BLIND (no inbound event -> no render) -> a CORRECTNESS LOSS, never 'Reactor beats content-cache on silent-staleness'.",
  },
  "re-wording": {
    headline: false,
    comparators: ["byte-diff"],
    note: "byte-diff over-renders on cosmetic re-wording (the re-wording trap made visible).",
  },
  "no-cheap-hash": {
    headline: false,
    comparators: [],
    tie: true,
    note: "semantic-drift domain with no cheap material hash -> HONEST TIE, reported as a tie in the abstract (Reactor degrades to forecast cadence).",
  },
  "composition": {
    headline: false,
    comparators: ["no-composition-reactor"],
    note: "amortization across N dependents vs islands.",
  },
  "time-scaling": {
    headline: false,
    comparators: ["react-loop"],
    note: "react-loop re-runs on a wall-clock heartbeat -> lambda-independent flat anchor.",
  },
});

/** Assert the matrix never routes a headline win to a blind comparator. */
function validateMatrix() {
  const errs = [];
  for (const [regime, m] of Object.entries(REGIME_COMPARATORS)) {
    if (m.headline && m.blind && m.blind.length > 0) {
      errs.push(`regime ${regime} is headline but lists blind comparators ${m.blind.join(",")}`);
    }
  }
  if (errs.length) throw new Error("regime matrix invalid:\n" + errs.join("\n"));
  return true;
}

module.exports = { REGIME_COMPARATORS, validateMatrix };
