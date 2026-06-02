---
name: executive-snapshot
kind: responsibility
---

# Executive Snapshot

> The **diamond fan-in apex** (U06). It reconverges three upstream paths —
> `Alert State`, `Raw Event Auditor`, `Count Trend` — and renders ONCE per input
> fingerprint tuple, not once per inbound edge. When several upstream paths move in
> the same fixpoint, the reconciler coalesces them into a single wake.

### Requires

- `AlertState` — the current status. *(Maintained by `alert-state`.)*
- `RawEventAudit` — the audit health. *(Maintained by `raw-event-auditor`.)*
- `CountTrend` — the trend direction. *(Maintained by `count-trend`.)*

Each edge subscribes to the producer's whole (atomic) truth. `executive-snapshot`
is **input-driven** off all three.

### Maintains

The `ExecutiveSnapshot` world-model.

- `status` — the headline alert status.
- `total` — the current total from the trend.
- `audit_health` — `clean | flagged` from the auditor.
- `trend` — the trend direction.
- `evidence_refs` — the set of input receipts this snapshot consumed.

#### structured

The snapshot is material in whole — it is the terminal artifact.

**Postcondition:** `evidence_refs` names exactly the three input receipts the
render consumed; it renders once per input-fingerprint tuple. Self-policed before
signing.

### Execution

Read `AlertState`, `RawEventAudit`, and `CountTrend` by reference, compose the
headline snapshot, and commit. A failed `AlertState` falls back to its prior valid
truth.

### Continuity

input-driven

When `Alert State` fails (U10), the snapshot reads the prior valid `AlertState`
truth by reference; it never consumes a partial failed output.
