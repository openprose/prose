---
name: sources-gateway
kind: gateway
---

# Sources Gateway

> The ingress for a bottom-up research tree. Raw sources arrive from outside the
> graph; this gateway normalizes the corpus into ONE FACET PER LEAF FINDING. That
> per-leaf split is the load-bearing mechanism of the whole example: revising one
> finding's source moves exactly one leaf facet, so only that finding's ancestor
> path wakes. It has no `### Requires` (its truth comes from outside), it
> `### Maintains` the per-leaf normalized corpus, and its `### Continuity` is
> **external-driven**, which is how Forme finds it as the single DAG entry point.

### Continuity

external-driven

A new source landing, a re-crawl, or a manual re-index translates into a *receipt*
at the edge of the graph — one wake event type, external source. The gateway turns
that trigger into the per-leaf corpus view the `finding` leaves subscribe to.

### Receives

- A corpus of raw source excerpts, keyed by leaf finding id (`A1`, `B2`, `C1`, …).
- Each leaf slice carries its claim text and a monotonic `rev` (the revision
  counter — bumping it is "this finding's source changed").

### Maintains

The per-leaf normalized corpus — the structured truth the finding leaves
subscribe to, projected so that EACH leaf is an independent subscribable facet:

- `leaves`: a map keyed by leaf id; each entry is
  `{ leaf, sub, rev, claim, corrupt }`.
- `leaf_count`: the number of leaves in the tree.

**Canonicalization spec**: each leaf's slice is material *only to its own facet*.
The crucial property is **independence** — revising leaf `B2`'s slice perturbs the
`leaf:B2` token and NOTHING else; every sibling leaf token is byte-identical, so
the sibling finding lanes never wake. An unknown facet token would silently never
propagate, so facet-less truth is exposed as the atomic facet, never `"*"`.

#### leaf:&lt;id&gt;

One facet PER leaf finding (`leaf:A1`, `leaf:B2`, `leaf:C1`, …). The fingerprint
of facet `leaf:X` is the fingerprint of ONLY leaf `X`'s slice. This is the
dark-lane boundary: a single-finding revision moves exactly one of these facets.
Each `finding` leaf subscribes to exactly its own `leaf:<id>` facet — never to
the whole corpus.
