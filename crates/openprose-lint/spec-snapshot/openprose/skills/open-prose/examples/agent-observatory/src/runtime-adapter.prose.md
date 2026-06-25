---
name: runtime-adapter
kind: responsibility
version: 0.15.0
---

# Runtime Adapter [runtime]

> A quiet watcher. There is one adapter per runtime (`claude`, `codex`,
> `opencode`, `pi`); the topology mounts this contract four times. Each adapter
> subscribes to ONLY its own runtime facet on the gateway, so it stays DARK
> unless that runtime's session slice actually moved. Heterogeneous session
> formats normalize into one ledger-ready record shape here.

### Requires

- the `runtime` facet of `runtime-watch` (NOT `@atomic`) — the adapter for
  `codex` wakes on `codex` only; a Claude change leaves it dark. This selective
  subscription is the dark lane: the gateway moved one facet, so exactly one
  adapter lane lights.

### Maintains

The normalized sessions for this runtime, as the truth the session-ledger merges:

- `runtime`: the runtime id
- `sessions`: `NormalizedSession[]`, each `{ session, runtime, rev, normalized_head, workstream }`
- `count`: the number of parsed sessions

Parse only the changed append range when the format supports it; large
transcripts do not require full re-summarization.

**Canonicalization spec**: the adapter exposes its whole truth as `@atomic` (it
has no named facets of its own). A facet-less producer subscribes via the
exported `@atomic` token — never a `"*"` wildcard, which would silently never
propagate.

### Continuity

- input-driven: a change on this runtime's own file-delta facet, or an
  adapter-config change, wakes exactly this adapter lane; a sibling runtime's
  change leaves it dark.
- A malformed or truncated session JSONL fails the render: it signs a `failed`
  receipt, commits nothing downstream, and the prior truth stands — the fault is
  contained to this one adapter lane.
