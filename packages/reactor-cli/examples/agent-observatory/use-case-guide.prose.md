---
name: use-case-guide
kind: responsibility
---

### Goal

Maintain a living guide of the use-case patterns observed across sessions: how
people are using the tool, so the guide can feed documentation and onboarding.

### Requires

- the use-case-signal facet of session-signal (the only wake source: a use-case
  signal moved)

### Maintains

A use-case guide. Material: the pattern set and, per pattern, its stable id, its
label, a representative goal, and its frequency; plus the total pattern count. The
example-session list and the last-seen time are immaterial. The guide moves only
when a pattern's label, goal, or frequency changes, or a pattern is added.

Postcondition: every pattern cites at least one session id it was observed in.

#### active-patterns
The patterns with their label and frequency. Subscribed to by dashboard.

### Continuity

- input-driven: wake only when the use-case-signal facet moves. A decision-only or
  bug-only session never touches this input, so this domain stays silent for it
  (memo-skip at zero cost).

### Invariants

- This render is a bounded transform over the use-case-signal it was woken with
  and this node's prior guide. Append or increment the one affected pattern; never
  scan the filesystem, read transcripts, or run shell commands. Complete in a few
  steps.
- The only writable surface is this node's published world-model.
