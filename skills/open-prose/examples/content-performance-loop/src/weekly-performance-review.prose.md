---
name: weekly-performance-review
kind: gateway
---

# Weekly Performance Review

### Continuity

- external-driven

### Schedule

- `cron`: 0 9 * * 1
- `timezone`: America/Los_Angeles

### Maintains

- `review-window`: the latest incoming review trigger as structured truth — the
  current week plus the available performance exports, content inventory, and
  campaign notes supplied by the local harness or operator
- immaterial: trigger delivery ids and receipt timestamps

### Emits

- content-learning-cycle

### Payload

Wake the content learning responsibility with the current week, available
performance exports, content inventory, and campaign notes supplied by the
local harness or operator.
