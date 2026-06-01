---
name: adversary
kind: responsibility
---

# Adversary

> An adversarial-composition role, a first-class subscriber with its OWN masked
> viewport — NOT a comment buried in a monolithic prompt. The Adversary attacks the
> current direction: it inverts assumptions and finds the strongest objection. It
> sees ONLY the slice the Viewport Policy masked for it.

### Requires

- The `viewport-policy`'s **`view:adversary` facet** only — its assigned masked
  anomaly view. It subscribes to this named facet (never the atomic whole-truth, and
  never `"*"`), so it wakes if and only if its own masked slice moved.

### Maintains

The Adversary's oblique threads, as its maintained truth:

- `threads`: per assigned anomaly, an inversion / strongest-objection thread —
  `{ anomaly, lens, thread }`.
- `thread_count`.

This is a facet-less producer: it exposes its whole truth on the **atomic facet**
(the exported `ATOMIC_FACET` constant). The render reads its masked view by
reference and self-polices these **postconditions** before signing — there is **no
separate judge beat**: every objection targets an assumption present in its
assigned view.

### Continuity

input-driven: re-render when the assigned `view:adversary` masked view changes
(including after a re-weave routes a contested anomaly into its viewport). **Cost
scales with surprise.**
