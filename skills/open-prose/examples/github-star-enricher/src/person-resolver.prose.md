---
name: person-resolver
kind: responsibility
---

# Person Resolver

> A **per-stargazer** responsibility (`person-resolver[user]`) that runs the
> **expensive** Exa People enrichment — but only when the cost gate is open. It is
> the worked example of *cost-gated external calls*: the paid call fires if and
> only if the cheap GitHub signal already cleared the threshold.

### Requires

- This user's `github-footprint-mapper` truth, on its **atomic facet**. The
  resolver reads `clears_enrichment_threshold` by reference — that flag is the
  gate.

### Maintains

The user's person profile, as this responsibility's maintained truth (read by
reference, postconditions self-policed, no separate judge beat):

- when the gate is **closed** (`clears_enrichment_threshold` is false): a cheap
  `deferred` truth — `enriched: false`, `exa_sources: []`. **No Exa People call is
  made**, so this render burns a fraction of the fresh an enriched render would.
- when the gate is **open**: `likely_employer`, `likely_role`, `exa_sources`, and
  an `identity_confidence` — gathered from a real (here, dry-run / synthetic-safe)
  Exa People call, at roughly six times the fresh cost of a local render.
- when the gate is open but the **Exa People call FAILS** (an outage / open
  circuit breaker): the render **fails LOUD** — it commits nothing, the prior
  identity stands, and the failure is **debuggable** (the receipt's cost names the
  failing call: `provider: "exa"`, `model: "exa-people"`), never a fabricated
  truth and never an anonymous red node. A failure propagates nothing — exactly
  like a skip — and the lane RECOVERS on the next wake once the adapter is back.

This is a facet-less producer exposing the single **atomic facet** (the exported
`ATOMIC_FACET` constant, never `"*"`).

### Continuity

input-driven: re-renders when the footprint changes enough to affect identity or
the gate decision. The cost cliff between a gated-off render and a paid render is
the lesson — expensive spend is reserved for stargazers the cheap evidence has
already qualified. **Cost scales with surprise**, and with qualification.
