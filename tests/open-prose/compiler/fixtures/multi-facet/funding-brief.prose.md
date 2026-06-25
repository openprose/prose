---
name: funding-brief
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E2BR1EF0
---

# Funding Brief

### Goal

A short brief summarizing each competitor's latest funding moves is maintained.

### Requires

- `funding` from the competitor activity monitor — the funding events per
  competitor. This subscription wakes only when the producer's `#### funding`
  facet token moves, not when hiring or product-launches move.

### Maintains

A prose brief per competitor summarizing recent funding. Material: the `briefs`
set, each carrying a `competitor` and a `summary`.

### Criteria

- Every brief references at least one funding event.

### Tools

(none)
