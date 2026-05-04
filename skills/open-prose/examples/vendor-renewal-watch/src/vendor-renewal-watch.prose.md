---
name: vendor-renewal-watch
kind: system
---

# Vendor Renewal Watch

### Description

Reviews vendor renewal signals, prepares evidence-backed renewal decisions, and
updates the durable renewal ledger.

### Services

- `collect-renewal-signals`
- `assess-vendor-renewal`
- `prepare-renewal-brief`
- `update-renewal-ledger`

### Requires

- `activation_event`: a scheduled scan, renewal-window change, vendor signal
  batch, responsibility pressure record, or manual vendor review request

### Ensures

- `renewal_brief`: vendor-owner-ready renewal briefs with evidence,
  recommendation, risk, and next action
- `ledger_update`: durable vendor renewal history, evidence fingerprints,
  owner handoff, and next review timing

### Invariants

- Every recommendation is tied to contract timing and current evidence.
- Critical vendors are flagged before risky cancellation or replacement advice.
- Ledger history is preserved so recurring renewals can be compared with prior
  decisions.

### Runtime

- `persist`: project
