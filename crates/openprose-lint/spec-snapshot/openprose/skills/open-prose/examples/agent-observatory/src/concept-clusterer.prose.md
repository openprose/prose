---
name: concept-clusterer
kind: responsibility
version: 0.15.0
---

# Concept Clusterer

> The EXPENSIVE, BATCHED synthesis — the single tall spike in the cost meter. It
> re-embeds and clusters the whole concept space across every workstream, which
> costs roughly an order of magnitude more fresh tokens than any cheap node. It
> subscribes to ONLY the gating `cluster-gate` facet of the Workstream Index, so
> it stays DARK through the entire quiet stretch and every small session delta,
> and wakes ONCE when a major new project appears.

### Requires

- the `cluster-gate` facet of `workstream-index` (NOT `@atomic`, NOT `rollup`) —
  the gate. It does not see ordinary rollup churn; it wakes only when the
  distinct workstream set moves.

### Maintains

The concept cluster graph:

- `clusters`: `Cluster[]`, each `{ cluster_id, workstream, concepts }`
- `cluster_count`: the number of clusters

The render re-embeds every workstream's concept space, so its fresh cost scales
with the number of distinct workstreams — the deliberately heavy node that makes
the batched-synthesis lesson visible.

**Canonicalization spec**: the clusterer exposes its whole truth as `@atomic`. A
self-tick on a quiet world finds its gating input unmoved, so it signs a `self`
skipped receipt that lights no edges and burns zero fresh — the audit floor.

### Continuity

- input-driven: a moved `cluster-gate` facet on `workstream-index` (the distinct
  workstream set changed — a major new project) wakes the clusterer.
- self-driven: a configured batch interval / after-N-tail-changes self-tick;
  when the gating input has not moved it signs a `self` skipped receipt that
  lights no edge and burns zero fresh — the audit floor.
- Batch intelligently; do not run on every file change.
