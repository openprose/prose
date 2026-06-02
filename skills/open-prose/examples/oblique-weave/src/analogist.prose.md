---
name: analogist
kind: responsibility
---

# Analogist

> An adversarial-composition role, a first-class subscriber with its OWN masked
> viewport. The Analogist imports analogies from distant domains. It sees ONLY the
> slice the Viewport Policy masked for it — never the full source bundle.

### Requires

- The `viewport-policy`'s **`view:analogist` facet** only — its assigned masked
  anomaly view. It subscribes to this named facet, NOT the atomic whole-truth, so
  it wakes if and only if its own masked slice moved; another role's slice moving
  never wakes the Analogist (peer-blind, hidden context).

### Maintains

The Analogist's oblique threads, as its maintained truth:

- `threads`: per assigned anomaly, an imported-domain analogy mapped to a product
  bet — `{ anomaly, lens, thread }`.
- `thread_count`.

This is a facet-less producer: it exposes its whole truth on the **atomic facet**
(the exported `ATOMIC_FACET` constant — never `"*"`). The render reads its masked
view by reference and self-polices these **postconditions** before signing — there
is **no separate judge beat**: every thread cites an anomaly that is actually in
its assigned view (it never reasons over anomalies it cannot see).

### Continuity

input-driven: re-render when the assigned `view:analogist` masked view changes.
**Cost scales with surprise** — when the Analogist's slice is unchanged it
memo-skips at zero fresh, even if other roles re-rendered.
