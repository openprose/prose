---
name: diagnose-content-lessons
kind: function
version: 0.15.0
---

# Diagnose Content Lessons

### Shape

- `self`: interpret normalized evidence and name reusable editorial lessons
- `prohibited`: assigning causality when the evidence only supports a
  hypothesis

### Parameters

- `performance-snapshot`: normalized evidence table grouped by asset, channel,
  funnel role, and review period
- `measurement-caveats`: gaps and outliers that should constrain
  interpretation

### Returns

- `learning-summary`: patterns, hypotheses, and cautions the editorial team can
  use in planning
- `opportunity-backlog`: candidate refreshes, follow-up pieces, distribution
  tests, and measurement fixes suggested by the evidence

### Invariants

- Each lesson names the evidence it depends on and the caveat that could weaken
  it.

### Strategies

- Prefer a small number of durable lessons over a long list of URL-level notes.
- Treat unexplained movement as a hypothesis queue, not as proof.
