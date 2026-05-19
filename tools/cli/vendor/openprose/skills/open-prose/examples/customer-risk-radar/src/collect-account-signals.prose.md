---
name: collect-account-signals
kind: service
---

# Collect Account Signals

### Description

Normalizes incoming customer events and selects accounts that need risk review.

### Requires

- `activation_event`: a scheduled review request, account signal change, risk
  pressure record, or manual account review request

### Ensures

- `account_signals`: accounts needing review with usage trend, support
  friction, renewal timing, stakeholder notes, prior risk state, and trigger
  reason
- each account has: account id, owner, newest evidence timestamp, and missing
  signal flags

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - risk_ledger: prior account risk states, owner handoffs, and next review timing
  - latest_signal_at: newest processed customer signal timestamp
writes:
  - latest_signal_at: advanced when newer customer signals are accepted for review
```

### Shape

- `self`: normalize activation events, deduplicate against project memory, and
  choose accounts for review
- `prohibited`: guessing unavailable product, support, or commercial facts

### Strategies

- when the activation is scheduled: include accounts whose next review is due
  or whose renewal window is approaching
- when the activation is pressure without specific accounts: select accounts
  with stale high or unknown risk from the ledger
