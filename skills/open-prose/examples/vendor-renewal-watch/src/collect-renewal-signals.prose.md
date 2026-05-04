---
name: collect-renewal-signals
kind: service
---

# Collect Renewal Signals

### Description

Normalizes renewal events and selects vendors that need review.

### Requires

- `activation_event`: a scheduled scan, contract-window change, spend update,
  usage change, pressure record, or manual vendor review request

### Ensures

- `vendor_signals`: vendors needing renewal review with contract timing, owner,
  spend trend, usage trend, criticality, prior ledger state, and trigger reason
- each vendor has: vendor id, renewal date or notice deadline, newest evidence
  timestamp, and missing-context flags

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - renewal_ledger: prior vendor decisions, owner handoffs, and next review timing
  - latest_vendor_signal_at: newest processed vendor signal timestamp
writes:
  - latest_vendor_signal_at: advanced when newer vendor signals are accepted for review
```

### Shape

- `self`: normalize activation events, deduplicate against project memory, and
  choose vendors whose renewal windows or signal changes need review
- `prohibited`: guessing unavailable contract terms, private usage, or vendor
  performance details

### Strategies

- when the activation is scheduled: include vendors with renewal or notice
  windows inside the configured horizon
- when a pressure record lacks vendor ids: select stale high-risk or
  soon-renewing vendors from the ledger
