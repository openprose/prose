---
name: content-performance-loop
kind: system
---

# Content Performance Loop

### Description

Turns raw content performance evidence into a weekly editorial learning brief
and a small queue of next actions.

### Services

- `normalize-performance-signals`
- `diagnose-content-lessons`
- `prioritize-next-actions`
- `prepare-editorial-brief`

### Requires

- `content_inventory`: published articles, landing pages, newsletters, and
  campaign assets in scope for the review
- `performance_exports`: traffic, engagement, conversion, search, and
  distribution metrics available for the review window
- `campaign_notes`: launches, promotions, audience changes, or measurement
  caveats that may explain the numbers

### Ensures

- `learning_brief`: concise editorial summary of what changed, why it likely
  changed, and what the team should learn
- `next_action_queue`: prioritized follow-up work for refreshes, experiments,
  distribution, or measurement cleanup

### Invariants

- Recommendations preserve the stated job of each content asset.
- Evidence quality is called out when metrics are partial, noisy, or
  inconsistent.

### Strategies

- When metrics conflict, prefer actions that improve instrumentation or test a
  small hypothesis before recommending a broad rewrite.
- When one piece spikes, compare it with similar assets before naming a pattern.

### Runtime

- `persist`: project
