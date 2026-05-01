---
name: patterns-demo
kind: system
---

### Services

```yaml
- name: reviewed-result
  pattern: worker-critic
  with:
    worker: worker
    critic: critic
  config:
    max_rounds: 4
```

### Description

Demonstrates explicit worker-critic composition with a local pattern definition.
The worker produces output, the critic evaluates it, and the pattern instance repeats
until the quality bar is met or the iteration budget is exhausted. In real
systems, this same shape can be imported from `std/patterns/worker-critic`
after `prose install`.

### Requires

- `task`: what to produce
- `quality-bar`: what "good enough" means

### Ensures

- `result`: output that meets the quality bar, refined through worker-critic iteration

### Strategies

- when critic score is below threshold: worker revises targeting specific issues
- max 4 iterations
