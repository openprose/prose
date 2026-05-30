---
name: topic-clusterer
kind: function
---

# Topic Clusterer

### Description

Connects normalized inbox items to active questions and the calling
responsibility's prior topic truth.

### Shape

- `self`: compare items, cluster by topic, preserve duplicate evidence
- `prohibited`: deciding owner assignments or final action wording

### Parameters

- `normalized-items`: cleaned item records with source and tag clues
- `batch-duplicate-hints`: likely duplicates within this batch
- `active-questions`: research questions, initiatives, or watch areas that
  should influence priority
- `prior-topics`: existing clusters, canonical sources, and duplicate groups
  read from the responsibility's world-model
- `prior-ignored`: item fingerprints and prior ignore rationale read from the
  responsibility's world-model

### Returns

- `clustered-items`: items grouped into existing or new topic clusters with
  duplicate reasoning
- `topic-map-updates`: merged clusters, new clusters, and duplicate
  cross-references for the responsibility to commit to its world-model
- `ignored-item-log`: items that are irrelevant or already resolved, with
  concise rationale

### Strategies

- Prefer linking to an existing cluster when the item materially updates the
  same question.
- Start a new cluster when the item raises a distinct question the team has not
  been tracking.
