---
name: roadmap-signals
kind: responsibility
---

# Roadmap Signals

A downstream channel listener. Subscribes to EXACTLY ONE router facet —
`#### feature-requests` — and maintains a feature-demand tally.

Because it subscribes to the feature facet ONLY, a bug report or a docs question
moving on the router never wakes it — it wakes only when the feature channel
moves.

### Requires

- `feature-channel`: the router's `#### feature-requests` facet ONLY. A move in
  any other channel leaves this node dark.

### Maintains

- `demand`: the feature-demand tally (one entry per catalogued feature request,
  with a coarse vote count).
- immaterial: ordering jitter in the tally.

### Continuity

- input-driven: a move on the router's `feature-requests` facet wakes a re-tally.
  A quiet re-wake (nothing moved) memo-skips at zero fresh.
