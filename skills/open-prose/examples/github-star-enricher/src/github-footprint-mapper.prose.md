---
name: github-footprint-mapper
kind: responsibility
---

# GitHub Footprint Mapper

> A **per-stargazer** responsibility (one mounted instance per eligible user,
> `github-footprint-mapper[user]`) that maps a stargazer's public GitHub work
> into the **cheap** signal the rest of the loop is gated on. It is the
> per-person fan-out lane and the cost gate's *input*: no expensive external call
> fires unless this cheap GitHub evidence clears the configured threshold.

### Requires

- This user's `eligible:<login>` facet on the `stargazer-registry` — and **only**
  that facet. The mapper for `alice` wakes when `alice`'s eligibility moves and
  never when `bob`'s does. That selective subscription IS the per-person fan-out.

### Maintains

The user's GitHub footprint, as this responsibility's maintained truth (read by
reference, postconditions self-policed, no separate judge beat):

- `signal`: a 0..1 fit score derived from cheap GitHub evidence alone (repos,
  recency, languages, org clues).
- `company`: the company / project identity the footprint resolves to — the
  **shared enrichment key** the company resolver is keyed by.
- `clears_enrichment_threshold`: the cost-gate decision, made on this cheap
  evidence **before** any paid Exa call. A user below the threshold is enriched no
  further.

This is a facet-less producer: it exposes its whole truth as the single **atomic
facet** (the exported `ATOMIC_FACET` constant, never `"*"`).

### Continuity

input-driven: the footprint re-renders when its user becomes newly eligible or
when its GitHub evidence changes materially. Prefer cheap GitHub evidence before
web enrichment — this node is the cheap half of the cost gate. When eligibility
does not move, it memo-skips and the expensive downstream nodes stay dark.
