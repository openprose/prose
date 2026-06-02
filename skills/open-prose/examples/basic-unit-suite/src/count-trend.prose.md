---
name: count-trend
kind: responsibility
---

# Count Trend

> The **self-continuity** node (U09). It subscribes to the `counts` facet AND
> reads its own prior truth by reference, and it can wake on its declared
> self-driven recheck without an upstream input. A no-op recheck — one that
> re-derives a byte-identical truth — propagates nothing; only a material change
> propagates.

### Requires

- `counts`: the current tallies. *(Maintained by `counter-events.counts`.)*
- prior `CountTrend`: read by reference for the previous total.

`count-trend` is **input-driven** off `counts`, PLUS **self-driven** so a lapsed
`valid_until` wakes it even when no upstream signal arrives.

### Maintains

The `CountTrend` world-model.

- `current_total` / `previous_total` — this and the last observed total.
- `direction` — `up | down | flat`.
- `valid_until` — the freshness horizon that arms the self-driven recheck.

#### structured

The trend is material in whole; it feeds `Executive Snapshot`.

**Postcondition:** `direction` is `up`/`down`/`flat` consistent with
`current_total` versus `previous_total`. Self-policed before signing.

### Execution

Read the `counts` facet and the prior `CountTrend` by reference, derive the
direction and the freshness horizon, and commit only if the trend truth moved.

### Continuity

input-driven plus self-driven recheck when `valid_until` lapses. A self-tick that
re-derives the same truth signs a `skipped` self receipt (zero fresh) and wakes
nothing downstream; a material trend change propagates to `Executive Snapshot`.
