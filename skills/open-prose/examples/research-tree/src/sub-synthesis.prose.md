---
name: sub-synthesis
kind: responsibility
version: 0.15.0
---

# Sub-Synthesis (an interior node of the research tree)

> The middle level of the tree. There is one `sub-synthesis` per sub-question
> (`A`, `B`, `C`). It fans IN from ONLY its own sub-question's finding leaves and
> re-weaves them into a sub-answer. Because it subscribes only to its own
> findings, a revision under a SIBLING sub-question never wakes it — that is what
> keeps the dark mass real. Propagation flows UP: findings feed this node, this
> node feeds the root.

### Goal

Each sub-question carries a current, coherent sub-answer woven from its own
findings — re-woven exactly when one of those findings moves, and no more often.

### Requires

Subscription contracts — `Requires.<facet> ↔ Maintains.<facet>`.

- the atomic truth of each `finding` leaf under this sub-question (e.g. sub `B`
  fans in from findings `B1`, `B2`, `B3`). *(Maintained by the `finding` leaves
  of this sub-question.)*

This is a convergent fan-in: a `sub-synthesis` is **input-driven** off its own
findings only. When TWO of its findings move in one drain, the reconciler wakes
this node EXACTLY once (fan-in dedupe), not once per moved finding.

### Maintains

The world-model schema — the standing sub-answer this node commits:

- `sub`, `title`: which sub-question this is.
- `findings`: the per-leaf `{ rev, finding }` it wove in.
- `finding_count`, `version`: how many findings, and the max revision folded.
- `answer`: the woven sub-answer text.

**Canonicalization spec**: the woven answer is material; the truth is exposed as
the atomic facet. If none of this sub-question's findings moved, this node never
wakes and writes a `skipped` receipt — a sibling sub-question's churn stops at
the gateway's per-leaf boundary and never reaches here.

### Continuity

input-driven, off its own findings only. A `sub-synthesis` holds no cadence of
its own; it re-weaves only when a finding beneath it moves. A `failed` finding
produces no moved facet, so this node is not woken by a failure — the prior
sub-answer stands.
