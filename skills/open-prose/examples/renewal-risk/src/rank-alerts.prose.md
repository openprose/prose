---
name: rank-alerts
kind: function
---

# Rank Alerts

### Description

A stateless helper the `renewal-alert-feed` responsibility calls to turn the
subscribed `risk` verdicts into the ordered, owner-addressed alert set. It holds
no world-model of its own; the parent responsibility owns the maintained truth
and invokes this via ProseScript `call`.

### Parameters

- `risk`: the `renewal-risk` responsibility's `risk` facet — the per-account live
  verdict (level + cited cause + next action).

### Returns

- `alerts`: the accounts that need owner action, each with the risk level, the
  cited cause, the next action, and the owner to page — ordered by urgency, with
  low-risk accounts dropped.

### Shape

- `self`: select the accounts whose level is medium or high; order high before
  medium; carry the cause, next action, and owner.
- `prohibited`: raising an alert for an account whose verdict did not change, or
  for a low-risk account.
