---
name: novelty-auditor
kind: responsibility
version: 0.15.0
---

# Novelty Auditor

> The **terminal** node: it watches for generic consensus collapse and, when the
> system becomes too generic, emits a recommended viewport shift. Its recommendation
> is a **diagnostic output** — applying it requires a later EXPLICIT `Weave Config`
> input, so the recommendation closes the loop **across an epoch boundary**, never
> as a same-epoch cycle. This is the anti-collapse pressure that keeps the weave
> from silently converging.

### Requires

- The `surprising-bet`'s maintained truth, on its **atomic facet** (the exported
  `ATOMIC_FACET` constant — never `"*"`).
- The `oblique-ledger`'s maintained truth, on its **atomic facet** — to score how
  many distinct threads (and preserved minorities) survived.

The auditor has **no edge back to the Viewport Policy**. It is a leaf: nothing
subscribes to it. That is what keeps the mounted graph acyclic.

### Maintains

The `NoveltyAudit`, as this responsibility's maintained truth:

- `genericness_score`, `convergence_score`: how generic / converged the memo became.
- `lost_threads`: minority threads that collapsed out of the bet.
- `recommended_viewport_shift`: the config change the operator should apply NEXT
  epoch — e.g. `{ bump_seed: 1 }` to rotate role viewports and break consensus.
- `reason`: why the shift is recommended (diagnostic; apply via a new Weave Config
  receipt).

This is a facet-less producer: it exposes its whole truth on the **atomic facet**.
The render reads the memo + the oblique ledger by reference and self-polices these
**postconditions** before signing — there is **no separate judge beat**: when
confidence rises while novelty falls, the memo is flagged for audit rather than
silently converging; the recommendation is explicitly marked diagnostic.

### Continuity

input-driven: re-render after the Surprising Bet Memo changes. Its
`recommended_viewport_shift` is **not** applied here — the operator (or a
controller) lifts it into a NEW explicit `Weave Config` delivery next epoch, which
re-projects the role viewports. The loop is DAG-preserving. **Cost scales with
surprise.**
