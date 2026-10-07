---
name: runtime-watch
kind: gateway
version: 0.15.0
---

# Runtime Watch

> The single entry point of the observatory. A scheduled scan (or a filesystem
> watcher) over the common agent-state roots — Claude Code, Codex, OpenCode, Pi —
> translates into ONE wake at the system's edge. The gateway has no
> `### Requires` (its input arrives from outside the graph), it `### Maintains`
> the latest normalized agent-fs truth, and its `### Continuity` is
> **external-driven**, which is how Forme finds it as the DAG entry point.

### Continuity

external-driven

Wake only when watched file fingerprints change. A re-scan that finds the same
bytes does not move any fingerprint, so the whole graph below memo-skips and the
cost meter stays flat. This is the point: a cheap gateway can watch every runtime
and the expensive synthesis only wakes when some session state actually changed.

### Receives

- An explicit operator-provided allowlist of watched roots, scanned on a
  schedule or by a filesystem watcher. There is no implicit home-directory
  crawl and the allowlist defaults to empty:
  - `~/.claude/projects/**/*.jsonl`, `~/.claude/tasks/**/*`
  - `~/.codex/sessions/**/*`, `~/.codex/archived_sessions/**/*`
  - `~/.opencode/**/*`
  - `~/.pi/agent/sessions/**/*`
- Per changed file: normalized path relative to an allowed root, mtime, size,
  content-hash (or append-range hash). Raw transcript bodies are not gateway
  output and are never copied into the world-model.
- `runtime`: one of `claude`, `codex`, `opencode`, `pi`

### Invariants

- Never inspect paths outside the explicit allowlist, follow symlinks outside
  an allowed root, or read credentials, environment files, or unrelated home
  directory data.
- Publish metadata and hashes only. Downstream nodes receive a bounded tail or
  redacted projection through a separately declared contract, not arbitrary
  transcript content.
- A missing or empty allowlist is a safe no-op, not permission to discover
  additional agent stores.

### Maintains

The normalized agent-fs: a per-runtime map of the watched session slices.

- `runtimes`: `{ claude: SessionDelta[], codex: SessionDelta[], opencode: SessionDelta[], pi: SessionDelta[] }`
- each `SessionDelta` carries `{ id, rev, head, workstream }`

**Facets** — the gateway re-projects each runtime's slice into an INDEPENDENT
facet token. This is the dark-lane boundary: a Claude-only change perturbs the
`claude` token and NOTHING else, so the three sibling adapter lanes stay dark.

#### claude

The fingerprint of ONLY the `claude` slice. The Claude Adapter subscribes here.

#### codex

The fingerprint of ONLY the `codex` slice. The Codex Adapter subscribes here.

#### opencode

The fingerprint of ONLY the `opencode` slice. The OpenCode Adapter subscribes here.

#### pi

The fingerprint of ONLY the `pi` slice. The Pi Adapter subscribes here.

**Canonicalization spec**: each per-runtime slice (by stable session id + rev) is
material to its own facet; transport mtimes and scan timestamps are immaterial — a
re-scan of unchanged files moves no facet. Facet-less subscribers may still read
the whole truth via `@atomic`.

### Payload

Pass the changed file deltas grouped by runtime. A whole-laptop scan or a focused
single-runtime delta are both valid shapes.
