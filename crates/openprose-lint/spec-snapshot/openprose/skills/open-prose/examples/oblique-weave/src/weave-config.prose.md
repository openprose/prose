---
name: weave-config
kind: gateway
version: 0.15.0
---

# Weave Config

> The second gateway: the explicit operator/controller config that steers HOW the
> Viewport Policy masks the truth for each role. It is the seam through which the
> terminal Novelty Auditor's recommendation re-enters the graph **next epoch** — a
> recommended viewport shift is applied by an operator (or a controller) as a NEW
> explicit Weave Config delivery, which keeps the mounted graph a DAG (no
> same-epoch cycle back from the auditor). Its `### Continuity` is
> **external-driven**.

### Continuity: external-driven

An operator edit, or a controller that lifts the Novelty Auditor's
`recommended_viewport_shift` into an applied config, translates into a *receipt*
at the edge of the system. This gateway is an **entry point**: a wake enters here.

Why this matters for the topology: the Novelty Auditor is terminal — it has **no
edge back to the Viewport Policy**. Applying its recommendation is modeled as a
fresh external Weave Config delivery (a new memo-key move on this entry node), so
the loop closes **across an epoch boundary**, not as a same-epoch cycle. The
mounted graph stays acyclic.

A re-delivery that carries a byte-identical config is a memo HIT (the gateway
memo-skips); a genuinely new config (e.g. a bumped `seed`) moves the entry node's
memo key and re-projects the role viewports.

### Receives

- `seed`: the deterministic seed that assigns anomalies to role viewports.
- `hidden_fields`: which fields are masked out of non-owning role views.
- `role_count`, `mask_rate`, `operator_note`: the rest of the weave policy.

### Maintains

The current explicit weave configuration, as the structured truth the Viewport
Policy subscribes to:

- `seed`: the rotation that decides which role sees which anomaly.
- `hidden_fields`: the masking policy.
- `note`: a human-readable provenance note (e.g. "re-weave: auditor recommended
  seed bump").

This is a facet-less producer: it exposes its whole maintained truth as the single
**atomic facet** (the exported `ATOMIC_FACET` constant — never `"*"`).

A render reads its prior truth **by reference**; it self-polices these
postconditions before signing — there is **no separate judge beat**.

### Emits

- viewport-policy

When this gateway's atomic facet moves, Forme wakes the Viewport Policy, which
re-projects every role's masked view under the new seed.
