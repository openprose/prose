---
name: research-inbox-triage
kind: system
---

# Research Inbox Triage

### Description

Turns a batch of incoming research material into deduplicated clusters,
priority-ranked items, and practical follow-up actions.

### Services

- `inbox-ingestor`
- `topic-clusterer`
- `priority-scorer`
- `action-planner`

### Requires

- `inbox_items`: new papers, links, notes, or questions awaiting triage
- `active_questions`: research questions, initiatives, or watch areas that
  should influence priority
- `available_owners`: people or roles who can accept follow-up work

### Ensures

- `triage_report`: scan-friendly summary of clusters, priorities, and next
  actions
- `topic_map_updates`: durable updates to topic clusters and duplicate history
- `ignored_item_log`: concise rationale for items that do not deserve follow-up

### Runtime

- `persist`: project

### Strategies

- When an item looks duplicated, keep the best source and record the duplicates
  as supporting context.
- When priority is uncertain, favor a lower-risk follow-up such as "skim" or
  "watch" rather than pretending the item is urgent.
