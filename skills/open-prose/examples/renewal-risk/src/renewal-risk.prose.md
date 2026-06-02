---
name: renewal-risk
kind: responsibility
---

# Renewal Risk

### Goal

Customer renewal risk is a standing, maintained truth: every active account
carries a current health verdict — risk level, cited evidence, trend, likely
cause, and a concrete next action — so account owners can intervene before a
renewal slips. The truth is re-judged for an account *only* when that account's
signals actually move; quiet accounts cost nothing.

### Requires

- `account-signals`: the current view of product usage, support history, renewal
  timing, and stakeholder movement for active customers. This responsibility
  subscribes to the gateway's per-account `acct` facets, so a single account's
  signal change wakes a re-judgement of *that* account, not the whole portfolio.

### Maintains

- `accounts`: per-account renewal-risk truth. Its subscribable parts are the two
  `####` facets below — each `####` part *is* a facet (a fingerprint unit + a
  `Requires.<facet>` ↔ `Maintains.<facet>` subscription symbol +
  `published/<facet>/…` subtree).
- each account has: current risk level, cited evidence, confidence, trend,
  likely cause, a concrete next action, the follow-up owner, and a renewal date.
- immaterial everywhere: scan timestamps and source request ids — a re-delivery
  of identical signals does not move the fingerprint, so the downstream alert
  writes a `skipped` receipt and spawns nothing. Cost scales with surprise.
- freshness: each account carries `last_reviewed` and a `valid_until` that lapses
  on the weekly cadence.
- postcondition: every risk level is supported by cited evidence or explicitly
  marked low confidence.
- postcondition: every high-risk account names a next action and an owner.
- These postconditions are self-policed before the render signs its truth —
  there is no separate judge beat.

#### risk

Material: the risk level, evidence set, confidence, trend, and next action. The
downstream alert feed subscribes here and wakes when the live risk verdict moves
— **not** when only the decision history is appended. A signal that nudges an
account but does not change its classification re-renders this truth to a
byte-identical `risk` facet, so the alert memo-skips (the non-material hit).

#### history

Material: prior risk decisions and owner handoffs, appended so repeat warnings
are explained instead of rediscovered. This is an append-only `decision_history`.

### Continuity

- self-driven: re-review each active account at least weekly (the `valid_until`
  lapse).
- input-driven: a material usage drop, support friction, renewal-window change,
  or stakeholder change wakes a re-judgement of that account before the next
  scheduled cadence.

### Invariants

- Do not infer health from a single metric without context.
- Do not expose private customer details beyond the account team that owns it.
- Keep recommended actions practical for a human account owner to perform.

### Execution

The render reads its prior world-model **by reference** —
`read_world_model("self")` — so unchanged accounts are carried forward untouched
and only the woken account is re-judged.

```prose
let prior = read_world_model("self")

let scored = call score-account-health
  account-signals: account-signals
  prior: prior

return { accounts: scored }
```
