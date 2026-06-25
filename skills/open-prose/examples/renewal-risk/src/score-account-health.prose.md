---
name: score-account-health
kind: function
version: 0.15.0
---

# Score Account Health

### Description

A stateless helper the `renewal-risk` responsibility calls to classify the woken
accounts. It is ephemeral — it holds no world-model of its own; the parent
responsibility owns the maintained truth and invokes this via ProseScript
`call`.

### Parameters

- `account-signals`: the incoming signal slice for the accounts to score (the
  woken accounts only).
- `prior`: the parent responsibility's prior `accounts` truth, read by reference,
  so unchanged accounts are carried forward and only moved accounts are re-judged.

### Returns

- `scored`: per-account health verdict — risk level, cited evidence, confidence,
  trend, likely cause, next action, owner, and renewal date — merged over the
  prior truth so quiet accounts are untouched.

### Shape

- `self`: classify each woken account's risk from its signals against the prior
  verdict; carry forward every account whose signals did not move.
- `prohibited`: inventing usage, support, or commercial facts that are not in the
  signals.

### Strategies

- when usage is dropping AND a renewal window is near: raise the risk level and
  name a concrete intervention with an owner.
- when signals nudge but the classification is unchanged: keep the prior verdict
  so the `risk` facet stays byte-identical and the alert downstream memo-skips.
