---
name: content-learning-cycle
kind: responsibility
id: 067NC4KG0DZJ18924CJ2A9H750
---

# Content Learning Cycle

### Goal

Published content is regularly evaluated against audience, traffic,
conversion, and distribution evidence so editorial planning improves from real
performance rather than preference or recency bias.

### Requires

- `content-inventory`: a current view of published articles, landing pages,
  newsletters, and campaign assets in scope, with their intended audience or job
- `performance-exports`: traffic, engagement, conversion, search, and
  distribution metrics available for the review window
- `campaign-notes`: launches, promotions, audience changes, or measurement
  caveats that may explain the numbers

### Maintains

- `learning`: the current editorial learning truth, with `brief`, `actions`, and
  `history` facets
- `brief` facet (material): a concise editorial summary of what changed, why it
  likely changed, evidence highlights, caveats, and decisions needed
- `actions` facet (material): a prioritized follow-up queue for refreshes,
  experiments, distribution, or measurement cleanup, each with an owner role,
  intended outcome, and evidence rationale
- `history` facet (material): prior recommendations and recorded learnings per
  content series, preserved so repeat reads are explained, not rediscovered
- immaterial: export pull timestamps and source request ids
- freshness: `last_reviewed` and a `valid_until` that lapses on the weekly cadence
- postcondition: the review distinguishes traffic quality, conversion quality,
  distribution lift, and audience fit
- postcondition: lessons identify concrete content patterns, not just winning or
  losing URLs
- postcondition: each lesson names the evidence it depends on and the caveat that
  could weaken it

### Continuity

- self-driven: review the latest content performance signals every Monday morning
- self-driven: do not let an active content series go more than two review cycles
  without a recorded learning or an explicit reason to pause
- input-driven: revisit prior recommendations when new performance evidence
  contradicts the previous read

### Invariants

- Do not overfit to a single spike without corroborating evidence.
- Do not recommend rewriting content that is already performing its intended job.
- Keep the review brief enough for a weekly editorial meeting.

### Execution

```prose
let snapshot = call normalize-performance-signals
  content-inventory: content-inventory
  performance-exports: performance-exports
  campaign-notes: campaign-notes

let lessons = call diagnose-content-lessons
  performance-snapshot: snapshot.performance-snapshot
  measurement-caveats: snapshot.measurement-caveats

let queue = call prioritize-next-actions
  learning-summary: lessons.learning-summary
  opportunity-backlog: lessons.opportunity-backlog

let brief = call prepare-editorial-brief
  learning-summary: lessons.learning-summary
  next-action-queue: queue.next-action-queue

return {
  brief: brief.learning-brief,
  actions: queue.next-action-queue,
  history: lessons.learning-summary
}
```
