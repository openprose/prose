---
name: score-vendor-renewal
kind: function
---

# Score Vendor Renewal

> The function helper — a *called* render (the library tier), not a mounted node.
> `vendor-renewals-prepared` calls it once per vendor via ProseScript `call`.
> It is stateless: arguments in, value out, no world-model, no `### Continuity`.

### Description

Turns one vendor's current signal plus its prior ledger entry into an
explainable renewal posture. Pure scoring logic, called constantly and authored
once — exactly the kind of work that belongs in a `function`, not a subscribed
node.

### Parameters

- `vendor`: the current normalized signal for one vendor — contract timing,
  owner, spend trend, usage trend, criticality, and missing-context flags.
- `prior_entry`: this vendor's prior world-model ledger entry (or null at first
  sight), so the score can compare against the earlier posture and history.

### Returns

A single scored assessment:

- `vendor_id`, `recommendation` (one of `renew`, `renegotiate`, `replace`,
  `cancel`, `needs-owner-review`), `confidence`, `risk`, `urgency`
- `evidence`: the cited signals the recommendation rests on
- `missing_context`: notes on what could not be corroborated
- `changed_from_prior`: whether the recommendation moved since `prior_entry`,
  and why — so the caller can decide whether to append to `decision_history`.

### Invariants

- A `cancel` or `replace` on a business-critical vendor names the operational
  risk and migration uncertainty.
- Low-confidence evidence yields `needs-owner-review`, never a forced decision.

### Shape

- `self`: weigh renewal timing, cost movement, usage value, criticality,
  alternatives, and owner sentiment for this one vendor.
- `prohibited`: inventing contract rights, pricing, usage, alternatives, or
  stakeholder preferences absent from `vendor` or `prior_entry`; reading or
  writing any world-model (a function is stateless).

### Strategies

- when spend is rising but usage is strong: prefer renegotiation or owner review
  before cancellation.
- when usage is low and the cancellation window is near: prioritize a clear owner
  handoff with concrete timing.
