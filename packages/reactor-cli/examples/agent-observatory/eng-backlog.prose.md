---
name: eng-backlog
kind: responsibility
version: 0.15.0
---

### Goal

Maintain a prioritized engineering backlog drawn from agent sessions: bugs,
tasks, and refactors surfaced, each tagged by project and anchored to the session
that surfaced it.

### Requires

- the bug-signal facet of session-signal (the only wake source: a bug or task
  signal moved)

### Maintains

A backlog. Material: the item set and, per item, its stable id, title, kind (bug,
task, or refactor), priority, and status (open, in_progress, or done); plus the
open count and the per-project open counts. The added time and the evidence
anchor are immaterial. The backlog moves only when an item's title, kind,
priority, or status changes, or an item is added.

Postcondition: every item cites the session id it was surfaced from.

#### open-items
The items whose status is open or in_progress, with their title, kind, and
priority. Subscribed to by dashboard.

#### by-project-counts
The per-project open counts and the total open count. Subscribed to by dashboard.

### Continuity

- input-driven: wake only when the bug-signal facet moves. A decision-only or
  use-case-only session never touches this input, so this domain stays silent for
  it (memo-skip at zero cost).

### Invariants

- This render is a bounded transform over the bug-signal it was woken with and
  this node's prior backlog. Append or update the one affected item; never scan
  the filesystem, read transcripts, or run shell commands. Complete in a few
  steps.
- The only writable surface is this node's published world-model.
