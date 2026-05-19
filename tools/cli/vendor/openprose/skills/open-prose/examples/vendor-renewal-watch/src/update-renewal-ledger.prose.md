---
name: update-renewal-ledger
kind: service
---

# Update Renewal Ledger

### Description

Records reviewed vendors and carries forward renewal continuity state.

### Requires

- `renewal_assessments`: vendors labeled with renewal recommendation, evidence,
  confidence, risk, and urgency
- `renewal_brief`: vendor-owner-ready briefs with decision rationale, next
  actions, and follow-up timing

### Ensures

- `ledger_update`: durable renewal ledger entries for reviewed vendors,
  including decision state, evidence fingerprint, owner handoff, and next
  review timing

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - renewal_ledger: prior vendor decisions, owner handoffs, and review timing
writes:
  - renewal_ledger: updated vendor renewal states, evidence fingerprints, and next review timing
```

### Shape

- `self`: write durable continuity records from declared assessments and briefs
- `prohibited`: deleting prior renewal history or overwriting owner handoffs
  without explanation

### Strategies

- when a vendor remains unresolved: preserve the prior state, append new
  evidence, and schedule the next review before the earliest deadline
- when a recommendation changes: record the reason so future reviews can compare
  outcome against the previous decision
