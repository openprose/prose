---
name: smoke-local-pattern
kind: system
version: 0.15.0
---

### Services

```yaml
- name: reviewed-result
  pattern: worker-critic
  with:
    worker: worker
    critic: critic
  config:
    max_rounds: 2
```

### Description

Verifies a local pattern definition can wire worker and critic slots.

### Requires

- `task`: a short task supplied by the smoke runner
- `quality-bar`: acceptance criteria supplied by the smoke runner

### Ensures

- `result`: accepted output containing the exact phrase `local-pattern-smoke-pass`

## worker

### Requires

- `task`: work to produce
- `feedback`: critic feedback to address, optional on the first round

### Ensures

- `output`: completed work product containing the exact phrase `local-pattern-smoke-pass`

## critic

### Requires

- `output`: worker output to evaluate
- `quality-bar`: acceptance criteria

### Ensures

- `score`: numeric quality score from 0 to 100
- `feedback`: specific critique if the output misses the quality bar
- `accepted`: whether the output meets the quality bar
