---
name: diversity-auditor
kind: responsibility
---

### Goal

A terminal diagnostic. Read the committed memo and the mask coverage matrix and
recommend whether to change the mask rate — WITHOUT feeding back into the masker,
so the graph stays acyclic. Its recommendation arrives as a new explicit mask
config input in a later run only if an operator applies it.

### Requires

- the current `InsightMemo` from `insight-synthesizer` (atomic)
- the current mask set from `viewport-masker` (atomic)

### Maintains

A diversity audit. Material: the convergence score, the coverage matrix, and the
mask-rate recommendation.

#### audit
`convergence_score`, the per-consumer `coverage_matrix`, the
`mask_rate_recommendation`, and the `show_all_baseline_recommendation`.

### Continuity

- input-driven: wake after the `InsightMemo` changes. This is a diagnostic output;
  it does NOT rewire or re-run the masker in this fixture (no cycle).
