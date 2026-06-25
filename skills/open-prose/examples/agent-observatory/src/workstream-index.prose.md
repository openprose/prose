---
name: workstream-index
kind: responsibility
version: 0.15.0
---

# Workstream Index

> The DIAMOND fan-in and the batch GATE. It rolls up all three per-session
> summaries into clusters of sessions working on the same project. It is woken
> EXACTLY ONCE even when two summaries move in the same drain. It exposes two
> facets that split cheap incremental work from expensive batched work: a
> `rollup` the artifacts read every render, and a `cluster-gate` that the
> expensive Concept Clusterer reads — which moves only when a major new project
> appears.

### Requires

- `summary-claudeA`, `summary-claudeB`, `summary-codexA` (each via `@atomic`) —
  the diamond. A single session-ledger frame that moves two session facets wakes
  two summaries, but the index is still woken exactly once (the reconciler
  dedupes the fan-in to a single wake).

### Maintains

The incremental workstream rollup:

- `rollup`: `{ per_session: { [id]: { rev, workstream } }, total_sessions }`
- `workstreams`: the sorted set of DISTINCT workstream tags
- `workstream_count`: the size of that set

This is an incremental rollup; it does not recluster every historical session on
each change.

**Facets** — the split that makes the expensive node batch.

#### rollup

The cheap incremental rollup the Agent Index and Agent Dashboard read. It moves
on every workstream-index render.

#### cluster-gate

The GATING facet the expensive Concept Clusterer reads. It is the fingerprint of
ONLY the DISTINCT workstream SET — so it moves iff a brand new workstream appears
(a "major new project"), NOT on every session edit. This is why the Clusterer
stays dark on small deltas and spikes only when the project set expands.

**Canonicalization spec**: `rollup` is material to every render; `cluster-gate`
is material only to the distinct-workstream set. A session edit that does not
introduce a new workstream moves `rollup` but NOT `cluster-gate`.

### Continuity

- input-driven: a moved truth on any of the three session summaries
  (`summary-claudeA`, `summary-claudeB`, `summary-codexA`) wakes the index
  exactly once, even when two summaries move in the same drain.
- Most wakes move `rollup` only; the Clusterer stays quiet until the workstream
  set itself changes.
