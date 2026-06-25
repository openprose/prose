---
name: expander-2
kind: responsibility
version: 0.15.0
---

### Goal

Expand the masked claim view assigned to slot 2 into hypotheses, seeing ONLY its
own deterministic projection of the scout claims — not the full claim space and
not the peer expander's view.

### Requires

- the `view_e2` facet of `viewport-masker` (the masked view for this slot ONLY —
  a selector subscription, not atomic)

### Maintains

An expansion ledger for slot 2. Material: the expanded claims and preserved
minorities.

#### claims
The expanded hypotheses derived from this slot's visible claims, plus the count of
hidden claims it was deliberately denied.

### Continuity

- input-driven: wake ONLY when this slot's `view_e2` facet changes. A change to
  Expander 1's view never wakes this node.
