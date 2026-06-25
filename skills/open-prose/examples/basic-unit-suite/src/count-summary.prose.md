---
name: count-summary
kind: responsibility
version: 0.15.0
---

# Count Summary

> The single responsibility that turns the gateway's `counts` facet into a
> threshold-aware summary (U02). It reads its prior world-model by reference,
> writes a new `CountSummary`, and signs a receipt naming the upstream receipt it
> consumed. It skips when `counts` has not moved (U03).

### Requires

- `counts`: the numeric tallies. *(Maintained by `counter-events.counts`.)*

This is the only subscribed input. `count-summary` is **input-driven**: it wakes
iff the `counts` facet fingerprint moves. A metadata-only event moves only
`raw_events`, so this node stays dark while `Raw Event Auditor` wakes (U05).

### Maintains

The `CountSummary` world-model — the structured summary the alerting chain reads.

- `total` — the material event count.
- `by_kind` — the per-kind tallies.
- `threshold_crossed` — whether `total` reached the alert threshold.
- `explanation` — a short rationale string.

#### structured

The whole summary is material: any change to `total`, `by_kind`, or
`threshold_crossed` moves this node's truth and propagates to `Alert State`.

**Postcondition:** `total` equals the count of accepted material events;
`threshold_crossed` is true iff `total ≥ threshold`. Self-policed before signing —
no separate judge beat.

### Execution

Read the `counts` facet and the prior summary by reference, fold the per-kind
totals, set `threshold_crossed`, and commit the structured summary.

### Continuity

input-driven
