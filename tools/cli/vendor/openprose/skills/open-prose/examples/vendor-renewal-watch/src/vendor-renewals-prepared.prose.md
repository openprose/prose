---
name: vendor-renewals-prepared
kind: responsibility
id: 067NC4KG11RN54TMANB5EP2SB8
---

# Vendor Renewals Prepared

### Goal

Upcoming vendor renewals are reviewed early enough that owners can renew,
renegotiate, replace, or cancel with clear evidence before contractual windows
close.

### Continuity

- Vendors with renewal, cancellation, or price-change windows inside 45 days
  should have a fresh renewal brief.
- Material spend, usage, security, support, or owner-sentiment changes should
  trigger review before the next scheduled cadence when known.
- Prior renewal decisions should remain available so repeated vendors are
  compared against earlier commitments and outcomes.

### Criteria

- Each renewal brief names the vendor, owner, renewal date, notice deadline,
  current spend, usage trend, risk, alternatives, and recommended decision.
- Recommendations distinguish `renew`, `renegotiate`, `replace`, `cancel`, and
  `needs-owner-review`.
- The durable ledger records reviewed vendors, evidence fingerprints,
  recommended decision, owner handoff, and next review timing.

### Constraints

- Do not recommend cancellation for production-critical vendors without naming
  operational risk and migration uncertainty.
- Do not invent contract terms, usage, alternatives, or stakeholder sentiment.
- Keep the review bounded to evidence available in the activation context and
  project memory unless a caller supplies external research.

### Tools

(none)

### Fulfillment

Prefer the local `vendor-renewal-watch` system.
