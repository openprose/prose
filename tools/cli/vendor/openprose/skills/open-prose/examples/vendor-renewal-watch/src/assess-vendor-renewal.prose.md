---
name: assess-vendor-renewal
kind: service
---

# Assess Vendor Renewal

### Description

Turns vendor renewal signals into explainable renewal assessments.

### Requires

- `vendor_signals`: vendors needing renewal review with contract timing, owner,
  spend trend, usage trend, criticality, and prior ledger state

### Ensures

- `renewal_assessments`: vendors labeled `renew`, `renegotiate`, `replace`,
  `cancel`, or `needs-owner-review` with evidence, confidence, risk, and
  urgency
- each assessment has: cited signal evidence, missing-context notes, criticality
  flags, and comparison with prior renewal state

### Invariants

- Cancellation and replacement recommendations call out operational risk when
  a vendor appears business-critical.
- Low-confidence evidence results in `needs-owner-review` rather than a forced
  decision.

### Shape

- `self`: weigh renewal timing, cost movement, usage value, criticality,
  alternatives, and owner sentiment
- `prohibited`: inventing contract rights, pricing, usage, alternatives, or
  stakeholder preferences absent from the input

### Strategies

- when spend is rising but usage is strong: prefer renegotiation or owner review
  before cancellation
- when usage is low and the cancellation window is near: prioritize clear
  owner handoff timing
