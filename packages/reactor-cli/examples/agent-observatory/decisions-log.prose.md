---
name: decisions-log
kind: responsibility
version: 0.15.0
---

### Goal

Maintain a running log of decisions and open questions drawn from agent sessions,
each traceable to the session that produced it.

### Requires

- the decision-signal facet of session-signal (the only wake source: a decision
  signal moved)

### Maintains

A decisions log. Material: the entry set and, per entry, its stable id, its text,
its kind (decision or open question), and its status (open or settled); plus the
open count. The recorded time is immaterial. The log moves only when a decision's
text, kind, or status changes, or an entry is added; a session that produced no
new decision content leaves the log unchanged.

Postcondition: every entry cites the session id it was derived from.

#### open-decisions
The entries whose status is open, with their text and kind. Subscribed to by
attention-queue and dashboard.

#### decision-history
The full entry set with the open count. Subscribed to by dashboard.

### Continuity

- input-driven: wake only when the decision-signal facet moves. A bug-only or
  use-case-only session never touches this input, so this domain stays silent for
  it (memo-skip at zero cost).

### Invariants

- This render is a bounded transform over the decision-signal it was woken with
  and this node's prior log. Append or update the one affected entry; never scan
  the filesystem, read transcripts, or run shell commands. Complete in a few
  steps.
- The only writable surface is this node's published world-model.
