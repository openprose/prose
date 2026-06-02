---
name: collect-account-signals
kind: function
---

# Collect Account Signals

### Description

Normalizes incoming customer events and selects accounts that need risk review.

### Parameters

- `account-signals`: a scheduled review request, account signal change, risk
  pressure record, or manual account review request, plus the prior account
  risk state the calling responsibility reads from its own world-model

### Returns

- `accounts-for-review`: accounts needing review with usage trend, support
  friction, renewal timing, stakeholder notes, prior risk state, and trigger
  reason
- each account has: account id, owner, newest evidence timestamp, and missing
  signal flags

### Shape

- `self`: normalize activation events, deduplicate against the prior risk state,
  and choose accounts for review
- `prohibited`: guessing unavailable product, support, or commercial facts

### Strategies

- when the activation is scheduled: include accounts whose next review is due
  or whose renewal window is approaching
- when the activation is pressure without specific accounts: select accounts
  with stale high or unknown risk from the prior state
