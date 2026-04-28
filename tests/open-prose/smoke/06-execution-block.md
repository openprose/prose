---
name: smoke-execution-block
kind: program
---

### Services

- `planner`
- `finisher`

### Description

Verifies a pinned `### Execution` block is followed.

### Requires

- `request`: a short request supplied by the smoke runner

### Ensures

- `result`: final output containing the exact phrase `execution-block-smoke-pass`

### Execution

```prose
let plan = call planner
  request: request

let result = call finisher
  plan: plan

return result
```

## planner

### Requires

- `request`: caller request

### Ensures

- `plan`: a two-step plan based on the request

## finisher

### Requires

- `plan`: plan from the planner

### Ensures

- `result`: final output containing the exact phrase `execution-block-smoke-pass`
