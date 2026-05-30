---
name: customer-risk-maintained
kind: responsibility
id: 067NC4KG0XVMH2AA9D64TKJFA0
---

# Customer Risk Maintained

### Goal

Customer risk is visible early enough that account owners can intervene before
churn, renewal, or escalation windows become urgent.

### Requires

- `account-signals`: a current view of product usage, support history,
  commercial context, and stakeholder movement for active customers

### Maintains

- `accounts`: per-account risk truth, with `risk` and `history` facets
- each account has: current risk level, cited evidence, confidence, trend,
  likely cause, a concrete next action, the follow-up owner, and next-review
  timing
- `risk` facet (material): the risk level, evidence set, confidence, trend, and
  next action — a downstream that surfaces alerts subscribes here
- `history` facet (material): prior risk decisions and owner handoffs, preserved
  so repeat warnings are explained instead of rediscovered from scratch
- immaterial: scan timestamps and source request ids
- freshness: each account carries `last_reviewed` and a `valid_until` that lapses
  on the weekly cadence
- postcondition: every risk level is supported by multiple signals or explicitly
  marked low confidence
- postcondition: every high-risk account names a next action and an owner handoff

### Continuity

- self-driven: re-review each active account at least weekly
- input-driven: material usage drops, support friction, stakeholder changes, or
  commercial changes wake a review before the next scheduled cadence

### Invariants

- Do not infer health from a single metric without context.
- Do not expose private customer details beyond the account team that owns the
  relationship.
- Keep recommended actions practical for a human account owner to perform.

### Execution

```prose
let signals = call collect-account-signals
  account-signals: account-signals

let assessments = call assess-risk
  account-signals: signals

let brief = call recommend-actions
  risk-assessments: assessments

return { accounts: brief }
```
