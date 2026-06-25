---
name: viewport-masker
kind: responsibility
version: 0.15.0
---

### Goal

Fold all three scouts' claims into one claim space, then project a DIFFERENT
deterministic masked view of it for each downstream expander. Hiding a different
2/3-keep / 1/3-hide subset from each consumer is what prevents early consensus
collapse — and because the mask is a pure function of `(seed, consumer, claim)`,
the projection is replayable to the byte.

### Requires

- all current scout ledgers from `scout-price`, `scout-friction`, `scout-desire`
  (a diamond fan-in, atomic)

### Maintains

The mask set. Material: the per-consumer visible/hidden partition, the coverage
matrix, and the policy reason. Each consumer's view is exposed as its OWN named
facet so a downstream expander wakes only when ITS view moves.

#### view_e1
The masked claim projection for Expander 1 — its visible claim subset under the
deterministic seed. This facet token moves iff Expander 1's visible subset moves.

#### view_e2
The masked claim projection for Expander 2 — its visible claim subset under the
deterministic seed. This facet token moves iff Expander 2's visible subset moves.

### Continuity

- input-driven: wake when any scout ledger changes. Use a deterministic seed so a
  run replays identically. Each projection is a selector boundary: a move in
  `view_e1` lights only Expander 1's lane, never Expander 2's.
