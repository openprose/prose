---
name: worker-critic
kind: composite
---

### Description

A minimal local composite that teaches the worker-critic topology without
requiring installed dependencies.

### Slots

- `worker`: produces or revises the work product
  - requires: `task`, optional `feedback`
  - ensures: `output`
- `critic`: evaluates the worker output against the quality bar
  - requires: `output`, `quality-bar`
  - ensures: `score`, `feedback`, `accepted`

### Config

- `max_rounds`: integer, default `3`

### Requires

- `task`: what to produce
- `quality-bar`: acceptance criteria

### Ensures

- `result`: accepted worker output, or the best output with final critique when the round budget is exhausted

### Invariants

- Information firewall: the critic receives only the worker's declared `output`, not scratch notes or private reasoning
- Termination: stop when `critic.accepted` is true or after `max_rounds`
- On exhaustion: return the latest worker output with the critic's final feedback attached

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
