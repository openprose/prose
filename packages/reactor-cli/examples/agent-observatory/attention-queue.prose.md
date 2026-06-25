---
name: attention-queue
kind: responsibility
version: 0.15.0
---

### Goal

Maintain a short list of the sessions that need a human now: blocked, errored,
waiting for user input, or carrying an open decision, each with a one-sentence
reason.

### Requires

- the attention-signal facet of session-signal (a session needs a human)
- the open-decisions facet of decisions-log (an open decision needs resolution)

### Maintains

An attention queue. Material: the queue and, per entry, its session id, its reason
(blocked, errored, waiting_for_user, or open_decision), and a one-line summary;
plus the total count needing attention. The checked time is immaterial. The queue
moves only when an entry is added, removed, or its reason changes.

Postcondition: no entry without a session id; the queue is ordered by reason.

#### needs-user
The entries whose reason is waiting_for_user, blocked, or errored. Subscribed to
by dashboard.

#### decision-blocked
The entries blocked on at least one open decision. Named distinctly from the
decisions log's own open-decisions facet so the wiring is unambiguous. Subscribed
to by dashboard.

### Continuity

- input-driven: wake when the attention-signal facet or the decisions log's
  open-decisions facet moves. A session that needs nothing and raises no decision
  never touches either input, so the queue stays unchanged (memo-skip at zero
  cost).

### Invariants

- This render is a bounded transform over the inputs it was woken with and this
  node's prior queue. Add, remove, or update the affected entries; never scan the
  filesystem, read transcripts, or run shell commands. Complete in a few steps.
- The only writable surface is this node's published world-model.
