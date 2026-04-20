---
name: composites-demo
kind: program
---

### Services

```yaml
- name: reviewed-result
  compose: worker-critic
  with:
    worker: worker
    critic: critic
    max_rounds: 4
```

### Description

Demonstrates explicit worker-critic composition with a local composite definition.
The worker produces output, the critic evaluates it, and the composed unit repeats
until the quality bar is met or the iteration budget is exhausted. In real
programs, this same shape can be imported from `std/composites/worker-critic`
after `prose install`.

### Requires

- `task`: what to produce
- `quality-bar`: what "good enough" means

### Ensures

- `result`: output that meets the quality bar, refined through worker-critic iteration

### Strategies

- when critic score is below threshold: worker revises targeting specific issues
- max 4 iterations
