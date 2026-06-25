---
name: ledger-feed
kind: gateway
version: 0.15.0
---

### Goal

Accept an existing on-disk receipt ledger — the chain-verifiable trail a prior
run already froze (here, the masked-relay replay) — as the audit's single
external feed. This gateway does NOT define a new DAG; it is the entry point of an
**audit/replay lens** laid over a ledger another graph produced. The receipts
arrive as evidence; nothing in this repo renders them.

### Maintains

The materialized audit feed: the ordered receipt trail exactly as it sits on disk,
plus the per-node `prev`-linked chains grouped out of the flat root `receipts.json`.

#### trail
The full append-order receipt array. This is the named facet the chain auditor
subscribes to — a byte-identical re-read of the same ledger does not move it, so
the audit stays quiet.

### Continuity

- external-driven: wake when a new (or edited) `receipts.json` is presented at the
  edge. This is the entry point; nothing upstream wakes it. The feed is read-only —
  the audit never writes back into the ledger it inspects.
