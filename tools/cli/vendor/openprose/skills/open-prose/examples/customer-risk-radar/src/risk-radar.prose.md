---
name: risk-radar
kind: system
---

# Risk Radar

### Description

Reviews customer signals, explains account risk, recommends next actions, and
updates the durable risk ledger.

### Services

- `collect-account-signals`
- `assess-risk`
- `recommend-actions`
- `update-risk-ledger`

### Requires

- `activation_event`: a scheduled review request, account signal change, risk
  pressure record, or manual account review request

### Ensures

- `risk_brief`: reviewed accounts with explainable risk levels, evidence, and
  recommended next actions
- `ledger_update`: durable account risk history, review timing, and owner
  follow-up state

### Invariants

- Every risk level is supported by multiple signals or explicitly marked as
  low confidence.
- Every high-risk account has a named next action and owner handoff.
- Ledger history is preserved so trend changes remain explainable.

### Runtime

- `persist`: project
