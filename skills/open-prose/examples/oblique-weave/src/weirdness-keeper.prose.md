---
name: weirdness-keeper
kind: responsibility
version: 0.15.0
---

# Weirdness Keeper

> An adversarial-composition role, a first-class subscriber with its OWN masked
> viewport. The Weirdness Keeper preserves low-consensus, high-weirdness ideas long
> enough to test them — it does NOT delete an odd hypothesis just because other
> roles ignore it. Uniquely, its masked view INCLUDES the `weirdness` score (a
> genuinely different viewport of the same truth).

### Requires

- The `viewport-policy`'s **`view:weirdness-keeper` facet** only — its assigned
  masked anomaly view, which (unlike the other roles) carries the `weirdness` score
  unmasked. It subscribes to this named facet (never the atomic whole-truth, and
  never `"*"`), so it wakes if and only if its own masked slice moved.

### Maintains

The Weirdness Keeper's preserved minority threads, as its maintained truth:

- `threads`: the preserved low-consensus ideas and why they are not dead yet —
  `{ anomaly, lens, thread }`.
- `thread_count`.

This is a facet-less producer: it exposes its whole truth on the **atomic facet**
(the exported `ATOMIC_FACET` constant). The render reads its masked view by
reference and self-polices these **postconditions** before signing — there is **no
separate judge beat**: a low-consensus idea is preserved with an explicit
"why-not-dead-yet" rationale and an "evidence-that-would-kill-it" note.

### Continuity

input-driven: re-render when the assigned `view:weirdness-keeper` masked view
changes. Do **not** drop a preserved idea solely because other roles ignore it.
**Cost scales with surprise.**
