---
name: root-synthesis
kind: responsibility
version: 0.15.0
---

# Root Synthesis (the apex of the research tree)

> The single apex of the tree. It fans IN from all three sub-syntheses and
> re-weaves the whole research answer. It is the heaviest node — it re-reads every
> sub-answer — so its re-synthesis on a single touched branch reads as the
> dominant fresh tick off an otherwise-quiet field. It wakes whenever ANY one
> sub-synthesis moves, but the sub-syntheses below it stay dark except for the
> single touched branch. The lit path is bounded by tree DEPTH (finding →
> sub-synthesis → root), never tree SIZE.

### Goal

The research question carries one current, coherent answer woven from all three
sub-answers — re-woven exactly when a sub-answer moves, and no more often.

### Requires

Subscription contracts — `Requires.<facet> ↔ Maintains.<facet>`.

- the atomic truth of each `sub-synthesis` (`A`, `B`, `C`). *(Maintained by the
  three `sub-synthesis` nodes.)*

A `root-synthesis` is **input-driven** off the three sub-syntheses. Two different
leaf revisions in different sub-questions light two DIFFERENT sub-synthesis
nodes, but both converge on this SAME root — the shared apex re-synthesizes each
time, while only the touched branch below it moves.

### Maintains

The world-model schema — the standing research answer this node commits:

- `sub_answers`: the per-sub `{ version, answer }` it wove in.
- `total_findings`: how many findings are synthesized across the tree.
- `headline`: the woven, citable research answer.

**Canonicalization spec**: the woven headline is material; the truth is exposed
as the atomic facet. If no sub-synthesis moved, the root never wakes and writes a
`skipped` receipt — the cost meter stays flat near zero on a quiet re-scan.

### Continuity

input-driven, off the three sub-syntheses. The root holds no cadence of its own;
it re-synthesizes only when a branch beneath it moves. A `self`-sourced tick in a
quiet world produces a `skipped` self receipt that lights no edge and burns no
fresh tokens — the audit floor.
