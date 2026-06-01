---
name: constraint-breaker
kind: responsibility
---

# Constraint Breaker

> An adversarial-composition role, a first-class subscriber with its OWN masked
> viewport. The Constraint Breaker asks "what if this assumed constraint were
> removed?" and follows the resulting bet. It sees ONLY the slice the Viewport
> Policy masked for it.

### Requires

- The `viewport-policy`'s **`view:constraint-breaker` facet** only — its assigned
  masked anomaly view. It subscribes to this named facet (never the atomic
  whole-truth, and never `"*"`), so it wakes if and only if its own masked slice
  moved.

### Maintains

The Constraint Breaker's oblique threads, as its maintained truth:

- `threads`: per assigned anomaly, an assumed-constraint-removed bet —
  `{ anomaly, lens, thread }`.
- `thread_count`.

This is a facet-less producer: it exposes its whole truth on the **atomic facet**
(the exported `ATOMIC_FACET` constant). The render reads its masked view by
reference and self-polices these **postconditions** before signing — there is **no
separate judge beat**: each broken-constraint bet is grounded in an anomaly present
in its assigned view.

### Continuity

input-driven: re-render when the assigned `view:constraint-breaker` masked view
changes. **Cost scales with surprise.**
