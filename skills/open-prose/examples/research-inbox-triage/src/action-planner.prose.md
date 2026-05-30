---
name: action-planner
kind: function
---

# Action Planner

### Description

Turns scored research clusters into a concise triage report and ownership-ready
follow-up queue.

### Shape

- `self`: select next actions, name owner roles, explain why ignored items stay
  ignored
- `prohibited`: contacting owners or modifying external task systems directly

### Parameters

- `clustered-items`: items grouped into topic clusters with duplicate reasoning
- `priority-ranking`: ranked clusters and items with scores, confidence, and
  short reasoning
- `ignored-item-log`: items that are irrelevant or already resolved, with
  concise rationale
- `available-owners`: people or roles who can accept follow-up work

### Returns

- `triage-report`: scan-friendly summary of clusters, priorities, and next
  actions

### Strategies

- Use action labels such as `read`, `skim`, `watch`, `archive`, and `escalate`
  so the report is easy to operationalize.
- Assign owner roles conservatively when the best person is not obvious.
