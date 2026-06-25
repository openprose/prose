---
name: digest
kind: responsibility
version: 0.15.0
---

# Daily Digest

The terminal fan-in. Assembles the shipped digest from every per-thread render
plus the priority ranking.

This is the other half of failure isolation: when one classifier failed and its
thread is absent, the digest STILL renders from the healthy threads — the digest
ships. A failed receipt upstream never produces a failed digest.

### Requires

- `thread-summaries`: each per-thread render's summary (the fan-in over the
  distinct threads). A thread that is absent (because its classifier failed) is
  simply skipped — never blocks the digest.
- `ranking`: the Priority node's ranked thread list, subscribed via the threader's
  cheap `rollup` facet so the order stays current on membership changes.

### Maintains

- `digest`: the shipped daily digest — a headline, the priority-ordered thread
  list, and a section per healthy thread.
- immaterial: assembly timestamps.
- postcondition: the digest ships whenever at least one healthy thread exists; a
  malformed email never blocks or corrupts it.

### Continuity

- input-driven: a per-thread render or the priority ranking moving wakes the
  digest. A quiet re-wake (nothing moved) memo-skips at zero fresh.
- self-driven: a periodic self-tick re-checks the shipped digest; when its inputs
  have not moved it records a `self` skip that lights no edge and costs nothing
  (the audit floor).
