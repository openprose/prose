---
name: session-summary
kind: responsibility
---

# Session Summary [session]

> A per-session tail summarizer. There is one summary per active session
> (`claudeA`, `claudeB`, `codexA`); the topology mounts this contract three
> times. Each subscribes to ONLY its own `session:<id>` facet on the
> session-ledger, so a change to a sibling session leaves it dark. The summaries
> fan into the Workstream Index as a diamond.

### Requires

- the `session:<id>` facet of `session-ledger` (NOT `@atomic`) — exactly one
  session. The summary for `claudeA` never wakes on a `codexA` edit.

### Maintains

The one-session tail summary, as the truth the Workstream Index reads:

- `session`: the session id
- `runtime`: the runtime that produced it
- `rev`: the session revision summarized
- `summary`: a one-line summary of the tail (`current goal`, `latest ask`)
- `workstream`: the session's current workstream tag

Read enough context to summarize the tail, not the whole transcript by default.

**Canonicalization spec**: the summary exposes its whole truth as `@atomic`. A
re-summarization that produces the same text moves no fingerprint, so the
downstream Workstream Index memo-skips.

### Continuity

- input-driven: a change on this session's own tail facet
  (`session:<id>` on `session-ledger`) wakes exactly this summary; a sibling
  session's edit leaves it dark.
- Prefer a stable summary so cosmetic re-orderings do not move the fingerprint
  and spend downstream tokens.
