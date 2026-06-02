---
name: oblique-ledger
kind: responsibility
---

# Oblique Thread Ledger

> The fan-in apex. A mounted `responsibility` that merges the four roles' oblique
> threads into one ledger **without erasing minority threads** — a diamond fan-in
> from the Analogist, Adversary, Constraint Breaker, and Weirdness Keeper. A single
> woken role re-renders this ledger exactly once (the diamond single-wake).

### Requires

- The `analogist`'s maintained truth (atomic facet).
- The `adversary`'s maintained truth (atomic facet).
- The `constraint-breaker`'s maintained truth (atomic facet).
- The `weirdness-keeper`'s maintained truth (atomic facet).

Each is subscribed on the **atomic facet** (the exported `ATOMIC_FACET` constant —
never `"*"`). When exactly one role re-renders (the hidden-context surprise), the
fan-in wakes this ledger ONCE; the three roles that stayed dark contribute their
prior threads by reference.

### Maintains

The merged oblique thread ledger, as this responsibility's maintained truth:

- `threads`: every role's threads, sorted deterministically.
- `preserved_minorities`: the Weirdness Keeper's threads, kept explicitly so a
  low-consensus idea is never silently dropped.
- `thread_count`.

This is a facet-less producer: it exposes its whole truth on the **atomic facet**.
The render reads each role's truth by reference and self-polices these
**postconditions** before signing — there is **no separate judge beat**: no role's
threads are erased on merge; minority (Weirdness Keeper) threads are preserved.

### Continuity

input-driven: re-render when any role ledger moves. **Cost scales with surprise** —
when all four role slices are unchanged, this ledger memo-skips at zero fresh.
