---
name: update-risk-ledger
kind: service
---

# Update Risk Ledger

### Description

Records reviewed accounts and carries forward risk continuity state.

### Requires

- `risk_assessments`: accounts labeled with risk level, evidence, confidence,
  trend, and urgency
- `risk_brief`: account-owner-ready briefs with next actions and follow-up
  timing

### Ensures

- `ledger_update`: durable risk ledger entries for reviewed accounts, including
  risk state, evidence fingerprint, owner handoff, and next review timing

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - risk_ledger: prior account risk states and owner handoffs
writes:
  - risk_ledger: updated account risk states, evidence fingerprints, and next review timing
```

### Shape

- `self`: write durable continuity records from declared assessments and briefs
- `prohibited`: discarding prior risk history or overwriting owner handoffs
  without explanation

### Strategies

- when an account remains high risk: preserve the prior evidence and append the
  newest reason for continued concern
- when risk improves: record the improvement cause and schedule a normal review
