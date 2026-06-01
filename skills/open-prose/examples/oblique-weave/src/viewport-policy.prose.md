---
name: viewport-policy
kind: responsibility
---

# Viewport Policy

> The hidden-context engine. A mounted `responsibility` that fuses the deduped
> anomalies with the explicit Weave Config and projects **one masked viewport per
> role** — a genuinely *different* slice of the *same* truth for each role. It is
> what makes the roles first-class subscribers each with their own masked view: a
> role wakes if and only if **its** masked facet moved.

### Requires

- The `signal-ledger`'s maintained truth, on its **atomic facet** — the deduped
  anomalies to be masked.
- The `weave-config` gateway's maintained truth, on its **atomic facet** — the
  `seed` and `hidden_fields` that decide which role sees which anomaly.

The render reads both by reference and assigns each anomaly to exactly one role's
viewport, keyed on the anomaly `id` (NOT its list position) so appending a new
anomaly perturbs only the one role it routes to. Deterministic seeds make the role
views replayable.

### Maintains

The current per-role masked viewports, as this responsibility's maintained truth.
Its `### Maintains` is **faceted**: each `#### view:<role>` sub-heading IS a facet
— an independent projection that moves only when that role's masked slice moves.
This is the propagation boundary that gives each role hidden context.

- `role_views`: the masked slice assigned to each role.
- `seed`, `policy_reason`: the provenance of this projection.

#### view:analogist

The masked slice the Analogist sees — only the anomalies routed to it. The
`weirdness` score is masked out (a different viewport of the same truth). This
facet moves only when the Analogist's assigned anomalies change; the Analogist
subscribes to **this facet only** and never wakes on another role's slice.

#### view:adversary

The masked slice the Adversary sees — only the anomalies routed to it, with
`weirdness` masked. The Adversary subscribes to **this facet only**.

#### view:constraint-breaker

The masked slice the Constraint Breaker sees — only its routed anomalies, with
`weirdness` masked. The Constraint Breaker subscribes to **this facet only**.

#### view:weirdness-keeper

The masked slice the Weirdness Keeper sees — its routed anomalies, and uniquely it
**does** see the `weirdness` score (its job is to preserve low-consensus, high-
weirdness ideas). The Weirdness Keeper subscribes to **this facet only**.

It also exposes its whole truth on the **atomic facet** (the exported
`ATOMIC_FACET` constant — never `"*"`) for any subscriber that needs the full
projection. The render self-polices these **postconditions** before signing —
there is **no separate judge beat**:

- each role's view contains ONLY the anomalies routed to it (peer-blind);
- the same `(seed, anomalies)` always projects byte-identical role views
  (deterministic, replayable);
- a new anomaly perturbs only the one role's facet it routes to.

### Continuity

input-driven: re-render when the deduped anomalies or the explicit Weave Config
move. A re-weave (a new `seed` from the Weave Config) re-routes the anomalies, so
the per-role facets move and the affected roles wake. **Cost scales with surprise.**
