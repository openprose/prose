---
name: topic-clusterer
kind: service
---

# Topic Clusterer

### Description

Connects normalized inbox items to active questions and existing topic memory.

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - topic_map: existing clusters, canonical sources, and duplicate groups
  - ignored_history: item fingerprints and prior ignore rationale
writes:
  - topic_map: merged clusters, new clusters, and duplicate cross-references
  - ignored_history: newly ignored item fingerprints and rationale
```

### Shape

- `self`: compare items, cluster by topic, preserve duplicate evidence
- `prohibited`: deciding owner assignments or final action wording

### Requires

- `normalized_items`: cleaned item records with source and tag clues
- `batch_duplicate_hints`: likely duplicates within this batch
- `active_questions`: research questions, initiatives, or watch areas that
  should influence priority

### Ensures

- `clustered_items`: items grouped into existing or new topic clusters with
  duplicate reasoning
- `topic_map_updates`: durable updates to topic clusters and duplicate history
- `ignored_item_log`: items that are irrelevant or already resolved, with
  concise rationale

### Strategies

- Prefer linking to an existing cluster when the item materially updates the
  same question.
- Start a new cluster when the item raises a distinct question the team has not
  been tracking.
