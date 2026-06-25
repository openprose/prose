---
name: docs-gap-tracker
kind: responsibility
version: 0.15.0
---

# Docs Gap Tracker

A downstream channel listener. Subscribes to EXACTLY ONE router facet —
`#### docs-questions` — and maintains a world-model of recurring documentation
gaps plus suggested FAQ/answer entries, explicitly framed as feeding the
AGENT-NATIVE docs surface / `llms.txt` ("Talk to us" support corpus).

Because it subscribes to the docs facet ONLY, a bug report or a feature request
moving on the router never wakes it — it wakes only when the docs channel moves.
A duplicate docs question (same canonical content) does not move the docs facet,
so the tracker dedup-skips.

### Requires

- `docs-channel`: the router's `#### docs-questions` facet ONLY. A move in any
  other channel leaves this node dark.

### Maintains

- `doc_gaps`: the recurring documentation gaps and suggested FAQ entries for the
  `llms.txt` / "Talk to us" surface.
- freshness: the gap list carries a `valid_until` that lapses one business day
  after the last review — so a stale list re-checks even when no new docs
  question arrives.
- immaterial: ordering jitter in the gap list.

### Continuity

- input-driven: a move on the router's `docs-questions` facet wakes a re-review.
- self-driven: re-review the gap list at least once per business day (the
  `valid_until` lapse). When inputs have not moved, the self-tick records a
  `self` skip that lights no edge and costs nothing (the audit floor).
