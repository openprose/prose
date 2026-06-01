---
name: signal-ledger
kind: responsibility
---

### Goal

Maintain a stable, deduplicated ledger of every signal ever observed, so the
peer-blind scouts downstream see one canonical evidence trail rather than the raw
inbox churn.

### Requires

- the accepted-signal set from the `signal-inbox` gateway's `ledger` facet

### Maintains

A signal ledger. Material: the ledger rows and the stable fingerprint over them.

#### ledger
Each row carries `id`, `source`, a `dedupe_key`, and `observed_at`, plus a
`stable_fingerprint` over the whole ledger. A re-delivered duplicate signal folds
into an existing row and does not move the fingerprint.

### Continuity

- input-driven: wake when the gateway's `ledger` facet moves. Preserve prior rows
  (a 30-day retention window). An unmoved upstream fingerprint writes a `skipped`
  receipt that spawns nothing — cost scales with surprise, not the clock.
