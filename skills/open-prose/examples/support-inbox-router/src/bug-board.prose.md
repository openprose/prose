---
name: bug-board
kind: responsibility
---

# Bug Board

A downstream channel listener. Subscribes to EXACTLY ONE router facet —
`#### bug-reports` — and maintains an open-bug register.

Because it subscribes to the bug facet ONLY, a docs question or a feature request
moving on the router never wakes it (a docs question never wakes the bug board) —
it wakes only when the bug channel moves.

### Requires

- `bug-channel`: the router's `#### bug-reports` facet ONLY. A move in any other
  channel leaves this node dark.

### Maintains

- `open_bugs`: the current open-bug register (one entry per catalogued bug),
  with a coarse status.
- immaterial: ordering jitter in the register.

### Continuity

- input-driven: a move on the router's `bug-reports` facet wakes a re-tally of
  the open bugs. A quiet re-wake (nothing moved) memo-skips at zero fresh.
