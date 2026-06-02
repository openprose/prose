---
name: session-ledger
kind: responsibility
---

# Session Ledger

> The first shared rollup. It fans in from all four runtime adapters and merges
> every runtime's normalized sessions into one per-session map — the single
> source of normalized session identity. It then re-projects each active session
> into an INDEPENDENT facet token, the SECOND dark lane: a change to one session
> wakes exactly one downstream summary.

### Requires

- `adapter-claude`, `adapter-codex`, `adapter-opencode`, `adapter-pi`
  (each via `@atomic`) — a fan-in over all runtimes. Only the adapter that
  actually moved contributes a change; the others reuse their prior truth.

### Maintains

The normalized session ledger, keyed by stable session id:

- `sessions`: a map keyed by `session_id`, each `{ id, runtime, rev, head, workstream }`
- `active`: the sorted list of active session ids

Preserve stable session identity across file moves, archive moves, and
runtime-specific path conventions.

**Facets** — one facet per active session, so a change to one session wakes only
that session's summary. The facet-less `@atomic` view carries the whole ledger.

#### session:claudeA

The fingerprint of ONLY the `claudeA` session. The `summary-claudeA` responsibility
and the `session-to-prose` responsibility both subscribe here.

#### session:claudeB

The fingerprint of ONLY the `claudeB` session. The `summary-claudeB` responsibility
subscribes here.

#### session:codexA

The fingerprint of ONLY the `codexA` session. The `summary-codexA` responsibility
subscribes here.

**Canonicalization spec**: each session record (by id + rev) is material to its
own facet; the merge order and absent sessions are immaterial. A re-merge of an
unchanged ledger moves no session facet.

### Continuity

- input-driven: a moved truth on any of the four runtime adapters
  (`adapter-claude`, `adapter-codex`, `adapter-opencode`, `adapter-pi`) wakes
  this fan-in merge.
- This is an incremental merge; it does not re-derive every historical session
  on each file change.
