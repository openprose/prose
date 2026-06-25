---
name: weekly-pulse
kind: responsibility
version: 0.15.0
---

# Weekly Pulse

The terminal brief. Assembles the shipped weekly "voice of customer" pulse from
the aggregator's cheap `rollup` facet — a headline, the per-theme totals, and a
short standing summary.

This is the headline of the example: the pulse is a STANDING, MAINTAINED truth
with a SELF-DRIVEN freshness cadence. It carries a `valid_until` that lapses on a
weekly cadence, and a self-tick on that lapse refreshes the brief — stamping a
new `valid_until` — even when no feedback arrived all week. Because a quiet
refresh moves NO new material (only the freshness clock advanced), the continuity
tick costs ZERO fresh tokens. A self-tick whose inputs have NOT moved and whose
`valid_until` has NOT lapsed memo-skips at zero (the audit floor).

### Requires

- `rollup`: the aggregator's cheap cross-theme rollup, subscribed via the
  `voice-of-customer` node's `rollup` facet ONLY. A move in a single theme facet
  that does not change the rollup leaves the pulse dark; a real membership shift
  re-renders it.
- `week`: the gateway's weekly clock (`week` facet). The cadence the freshness
  lapse rides — when the clock advances past `valid_until`, the self-tick
  refreshes the brief.

### Maintains

- `pulse`: the shipped weekly pulse brief — a headline, the priority-ordered
  per-theme totals, the total feedback count, and the citing top quotes.
- `freshness`: each pulse carries a `last_reviewed` week and a `valid_until` that
  lapses one week later. The freshness fields are what the self-driven cadence
  reads and re-stamps.
- immaterial: assembly timestamps.
- postcondition: the brief is never staler than one week — either a real rollup
  move refreshed it, or the weekly self-tick re-stamped its `valid_until` at zero
  cost.

#### pulse

Material: the shipped brief content (headline + per-theme totals + quotes). Moves
when the rollup moves; a pure freshness re-stamp leaves the brief content stable.

### Continuity

- self-driven: re-review the pulse at least weekly (the `valid_until` lapse). The
  weekly clock advancing past `valid_until` fires a self-sourced wake that
  refreshes the brief and re-stamps `valid_until` — a zero-token continuity tick.
- input-driven: a real rollup move (new or changed feedback that shifts a
  per-theme total) wakes a re-render of the brief before the next scheduled
  cadence.

A self-tick that finds the `valid_until` NOT yet lapsed and the rollup unmoved
records a `self` skip that lights no edge and costs nothing (the audit floor).
