---
name: intent-safety-scorer
kind: responsibility
version: 0.15.0
---

# Intent & Safety Scorer

> A **per-stargazer** responsibility (`intent-safety-scorer[user]`) that fans in
> the user's footprint, person profile, and the **shared** company receipt, then
> decides a recommended track. Its `track` facet is the gate on the expensive
> sample build downstream.

### Requires

- This user's `github-footprint-mapper` truth (atomic facet).
- This user's `person-resolver` truth (atomic facet).
- The **shared** `company-resolver` truth for this user's company (atomic facet) —
  the same receipt `alice` and `bob` both consume.

### Maintains

The intent & safety score, as this responsibility's maintained truth (read by
reference, postconditions self-policed, no separate judge beat):

- `fit_score`, `contact_risk`, `company_context`, `enriched_identity`.
- `recommended_track`: `defer | watch | build_sample`. Prefer false negatives
  over creepy or generic outreach — a low-signal stargazer lands in `watch` or
  `defer` and never reaches a sample build.

Its canonicalizer exposes a gating facet in addition to the atomic one:

#### track

The fingerprint of `recommended_track` alone. The `sample-program-builder`
subscribes to **only** this facet, so it stays dark unless the track actually
becomes `build_sample` — a cosmetic change to the score that leaves the track
fixed never wakes the expensive builder.

### Continuity

input-driven: re-renders when the footprint, person, company, or suppression
evidence changes. When none move, it memo-skips and the builder downstream is
never woken.
