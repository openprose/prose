---
name: smoke-local-composite
kind: program
---

### Services

```yaml
- name: reviewed-result
  compose: worker-critic
  with:
    worker: worker
    critic: critic
    max_rounds: 2
```

### Description

Verifies a local composite definition can wire worker and critic slots.

### Requires

- `task`: a short task supplied by the smoke runner
- `quality-bar`: acceptance criteria supplied by the smoke runner

### Ensures

- `result`: accepted output containing the exact phrase `local-composite-smoke-pass`

## worker

### Requires

- `task`: work to produce
- `feedback`: critic feedback to address, optional on the first round

### Ensures

- `output`: completed work product containing the exact phrase `local-composite-smoke-pass`

## critic

### Requires

- `output`: worker output to evaluate
- `quality-bar`: acceptance criteria

### Ensures

- `score`: numeric quality score from 0 to 100
- `feedback`: specific critique if the output misses the quality bar
- `accepted`: whether the output meets the quality bar

## worker-critic

---
name: worker-critic
kind: composite
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

### Requires

- `task`: what to produce
- `quality-bar`: acceptance criteria

### Ensures

- `result`: accepted worker output, or the best output with final critique when the round budget is exhausted

### Invariants

- stop when `critic.accepted` is true or after `max_rounds`
- On exhaustion: return the latest worker output with final feedback

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
