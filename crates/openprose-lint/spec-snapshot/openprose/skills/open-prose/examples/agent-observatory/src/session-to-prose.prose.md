---
name: session-to-prose
kind: responsibility
version: 0.15.0
---

# Session → Prose

> The folded-in meta-generator, restructured as a STANDING responsibility inside
> the observatory. The old `session-to-prose` example was a one-shot `function`
> that converted an agent session log into a generalized OpenProse Contract
> Markdown program. Here it becomes a watched responsibility: it subscribes to
> ONE Claude transcript on the session-ledger and maintains a generalized
> `.prose` contract extracted from that session's workflow — re-emitting only
> when the watched transcript actually moves.

### Requires

- the `session:claudeA` facet of `session-ledger` (NOT `@atomic`) — it watches
  exactly one transcript. It stays DARK on every other session's edits, so it
  does not burn extraction tokens on sessions it is not tracking.

### Maintains

The generalized program extracted from the watched transcript:

- `watched_session`: the session id it tracks (`claudeA`)
- `watched_rev`: the transcript revision the program was generalized from
- `program_kind`: `function` for a single-helper transform, `responsibility`
  for a standing world-model-maintaining workflow
- `program`: a valid OpenProse `*.prose.md` that generalizes the session's
  workflow using CURRENT Contract Markdown sections (`### Requires` → `### Maintains`
  → `### Continuity` for a responsibility; `### Parameters` → `### Returns` for a
  function). It captures iteration loops, parallel work, decision gates, and
  phase transitions evidenced by the session.
- `program_content_hash`: a stable digest so an unchanged extraction is a memo hit

This responsibility self-polices its postconditions before signing — the
generated program must use generalized names (not session-specific ids), be
syntactically valid Contract Markdown, and cite the session evidence it
generalized from. There is no separate judge beat.

**Canonicalization spec**: the program exposes its whole truth as `@atomic`. A
re-extraction that yields the same `program_content_hash` moves no fingerprint,
so the Agent Index downstream memo-skips.

### Continuity

- input-driven: a change on the watched transcript's tail facet
  (`session:claudeA` on `session-ledger`) wakes the extraction; every other
  session's edit leaves it dark.
- Parse a stable source snapshot, never a live session log, so a growing
  transcript cannot produce a partial extraction.
