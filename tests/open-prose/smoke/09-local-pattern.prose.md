---
name: smoke-local-pattern
kind: function
version: 0.15.0
---

### Description

Verifies a local `kind: pattern` definition can be instantiated with worker and
critic slots.

### Parameters

- `task`: a short task supplied by the smoke runner
- `quality-bar`: acceptance criteria supplied by the smoke runner

### Returns

- `result`: accepted output containing the exact phrase `local-pattern-smoke-pass`

### Patterns

```yaml
- name: reviewed-result
  pattern: worker-critic
  with:
    worker: worker
    critic: critic
  config:
    max_rounds: 2
```

### Execution

```prose
let outcome = call reviewed-result
  task: task
  quality-bar: quality-bar

return outcome
```

## worker

### Parameters

- `task`: work to produce
- `feedback`: critic feedback to address, optional on the first round

### Returns

- `output`: completed work product containing the exact phrase `local-pattern-smoke-pass`

## critic

### Parameters

- `output`: worker output to evaluate
- `quality-bar`: acceptance criteria

### Returns

- `score`: numeric quality score from 0 to 100
- `feedback`: specific critique if the output misses the quality bar
- `accepted`: whether the output meets the quality bar
