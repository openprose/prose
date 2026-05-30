---
name: research-inbox-responsibility
kind: responsibility
id: 067NC4KG15XNS7AYBXG62RK3CG
---

# Research Inbox Responsibility

### Goal

The research inbox stays deduplicated, prioritized, and converted into clear
next actions for the team's active questions.

### Requires

- `inbox-items`: a current view of new papers, links, notes, or questions
  awaiting triage
- `active-questions`: research questions, initiatives, or watch areas that
  should influence priority
- `available-owners`: people or roles who can accept follow-up work

### Maintains

- `triage`: the current triage truth, with `report`, `topics`, and `ignored`
  facets
- `report` facet (material): a scan-friendly summary of clusters, priorities,
  and next actions — each follow-up names an owner role, next step, and reason
- `topics` facet (material): durable topic clusters, canonical sources, and
  duplicate cross-references, carried forward across renders
- `ignored` facet (material): items that do not deserve follow-up, with enough
  rationale to avoid repeated re-triage
- immaterial: scan timestamps and submission receipt ids
- postcondition: each item is either linked to an existing cluster or starts a
  new cluster with a concise rationale
- postcondition: priority reflects relevance to active questions, novelty,
  credibility, and urgency
- postcondition: the strongest source is preserved for any duplicate set; an
  item is never discarded solely because it is duplicated

### Continuity

- input-driven: new inbox items wake triage; they should be triaged before they
  are more than one business day old
- self-driven: re-surface stale high-priority items when no owner has accepted
  the follow-up

### Invariants

- Keep summaries short enough for a researcher to scan before deciding what to
  read.
- Do not invent claims that are not present in the submitted item.

### Execution

```prose
let normalized = call inbox-ingestor
  inbox-items: inbox-items

let clustered = call topic-clusterer
  normalized-items: normalized.normalized-items
  batch-duplicate-hints: normalized.batch-duplicate-hints
  active-questions: active-questions
  prior-topics: triage.topics
  prior-ignored: triage.ignored

let ranking = call priority-scorer
  clustered-items: clustered.clustered-items
  active-questions: active-questions

let report = call action-planner
  clustered-items: clustered.clustered-items
  priority-ranking: ranking
  ignored-item-log: clustered.ignored-item-log
  available-owners: available-owners

return {
  report: report,
  topics: clustered.topic-map-updates,
  ignored: clustered.ignored-item-log
}
```
