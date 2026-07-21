---
name: worker-critic
kind: pattern
version: 0.15.0
---

### Slots

- `worker`: produces or revises the work product
  - requires: `task`, optional `feedback`
  - ensures: `output`
- `critic`: evaluates the worker output against the quality bar
  - requires: `output`, `quality-bar`
  - ensures: `score`, `feedback`, `accepted`

### Config

- `max_rounds`: integer, default `2`

### Invariants

- stop when `critic.accepted` is true or after `max_rounds`
- on exhaustion: return the latest worker output with final feedback

### Delegation

```prose
let current = call worker
  task: task
let final_review = "not yet evaluated"

repeat max_rounds:
  let review = call critic
    output: current
    quality-bar: quality-bar

  if review accepted:
    return {
      result: current
    }

  current = call worker
    task: task
    feedback: review
  final_review = review

return {
  result: {
    output: current
    final_feedback: final_review
  }
}
```
