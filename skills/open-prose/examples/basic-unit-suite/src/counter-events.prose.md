---
name: counter-events
kind: gateway
version: 0.15.0
---

# Counter Events

> The gateway — the system's ingress. It has no `### Requires` (its input arrives
> from outside the graph), it `### Maintains` the canonical `CounterEventLedger`,
> and its `### Continuity` is **external-driven**, which is how Forme registers it
> as the single DAG entry point (U11).

### Continuity

external-driven

A webhook, a poll, or a manual kick becomes one external wake at the system's
edge. The gateway folds each accepted counter event into the canonical ledger and
projects two **independent facets** so a downstream subscriber wakes only on the
slice it actually depends on (U05). Replaying the same event id is a no-op — the
ledger dedups by id, so a re-delivery produces a byte-identical world-model and
the gateway memo-skips (U01/U03).

### Receives

- A counter event: `{ id, kind, value, material? }`. An event with
  `material: false` is **accepted into the audit trail but excluded from the
  tallies** — it is the metadata-only event that moves `raw_events` without moving
  `counts`.

### Maintains

The `CounterEventLedger` — the standing truth every downstream responsibility
subscribes to. Its canonicalization splits the truth into the two facets below, so
a change to one slice never spuriously wakes a subscriber of the other.

- `high_water_mark` — the running material event total.
- `counts_by_kind` — the per-kind material tallies.
- `accepted_event_ids` — the full accepted id set (material and metadata-only).
- `last_seen_at` — an immaterial monotone marker (it never appears in a facet, so
  it cannot wake a subscriber on its own).

#### counts

The numeric tallies (`high_water_mark`, `counts_by_kind`) over **material events
only**. Moves when a material event is accepted; does NOT move on a metadata-only
event. `Count Summary` and `Count Trend` subscribe here.

#### raw_events

The accepted-event id set plus duplicate / malformed flags. Moves whenever the
accepted set changes — including a metadata-only event. `Raw Event Auditor`
subscribes here.

### Emits

- count-summary
- raw-event-auditor
- count-trend

Forme keys the wake on the producing node; the subscribers above resolve their
edges to this gateway's `counts` / `raw_events` facets.

### Continuity recheck

A weekday 09:00 self-kick may re-scan even when no webhook fires; a byte-identical
re-scan memo-skips, so the self-kick costs nothing when nothing changed.
