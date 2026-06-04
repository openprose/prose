---
name: session-signal
kind: responsibility
---

### Goal

For each changed session, classify its tail into small, typed, per-domain signals
so each downstream domain wakes only when its own signal moves. This is the
cheap gatekeeper of the pipeline: it does not summarize the whole session, it
emits at most a one-line typed signal per domain (or nothing).

### Requires

- the changed-session set from the claude-sessions gateway (each session's tail
  receipt: id, project, branch, and a short tail snippet)

### Maintains

A set of per-session signals, split into four independently-subscribable facets
so a session that carries only one kind of signal moves only that one facet. A
facet is absent for a session when that session carries no signal of that kind,
so an unrelated session never moves an unrelated domain. Material per signal: its
session id, project, and a single short line. The fetch time, the file mtime, and
the tail byte offsets are immaterial and are excluded from the fingerprint.

Postconditions: every emitted signal carries a session id and a project; a signal
is emitted only when the tail actually evidences it; a session with a purely
routine tail emits no signals at all.

#### decision-signal
Per session, a one-line decision or open question the tail evidences (a choice
being weighed or made, a tradeoff, a reversal). Absent when the tail carries no
decision. Subscribed to by decisions-log and attention-queue.

#### bug-signal
Per session, a one-line bug, failing repro, or concrete task the tail evidences.
Absent when the tail carries no engineering task. Subscribed to by eng-backlog.

#### use-case-signal
Per session, a one-line use-case or recurring usage pattern the tail evidences
(how someone is using the tool). Absent when the tail carries no use-case.
Subscribed to by use-case-guide.

#### attention-signal
Per session, a one-line reason the session needs a human now (blocked, errored,
waiting for user). Absent when the session needs nothing. Subscribed to by
attention-queue.

### Continuity

- input-driven: re-classify a session when its fingerprint moves in the gateway
  set. A session whose fingerprint did not move is skipped at zero cost.

### Invariants

- This render is a bounded transform over the tail snippet already carried in the
  wake evidence. Read ONLY that inline tail and this node's prior world-model.
  Never open the session file, scan the filesystem, read the repo or node_modules,
  or run shell commands. Complete in a few steps.
- Classify into the four fixed signal shapes only; emit at most one short line per
  facet per session, and emit nothing for a facet the tail does not evidence. Do
  not write paragraphs, do not summarize the transcript.
- The only writable surface is this node's published world-model.
