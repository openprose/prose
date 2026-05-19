---
name: prioritize-next-actions
kind: service
---

# Prioritize Next Actions

### Shape

- `self`: rank candidate work by impact, effort, confidence, and timeliness
- `prohibited`: creating work that is too vague for an editor or marketer to
  accept

### Requires

- `learning_summary`: patterns, hypotheses, and cautions from the performance
  diagnosis
- `opportunity_backlog`: candidate refreshes, follow-up pieces, distribution
  tests, and measurement fixes

### Ensures

- `next_action_queue`: ordered list of editorial, distribution, experiment, and
  instrumentation actions for the next planning cycle

### Invariants

- Each action includes a plain owner role, intended outcome, and evidence
  rationale.

### Strategies

- Prefer one high-confidence content refresh and one learning experiment over a
  broad backlog with no sequencing.
