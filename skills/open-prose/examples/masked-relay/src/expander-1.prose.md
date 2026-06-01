---
name: expander-1
kind: responsibility
---

### Goal

Expand the masked claim view assigned to slot 1 into hypotheses, seeing ONLY its
own deterministic projection of the scout claims — not the full claim space and
not the peer expander's view.

### Requires

- the `view_e1` facet of `viewport-masker` (the masked view for this slot ONLY —
  a selector subscription, not atomic)

### Maintains

An expansion ledger for slot 1. Material: the expanded claims and preserved
minorities.

#### claims
The expanded hypotheses derived from this slot's visible claims, plus the count of
hidden claims it was deliberately denied.

### Continuity

- input-driven: wake ONLY when this slot's `view_e1` facet changes. A change to
  Expander 2's view never wakes this node — that is the masked-projection
  selector boundary the facet edge proves.
