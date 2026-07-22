---
name: smoke-execution-block
kind: function
version: 0.15.0
---

### Description

Verifies a pinned `### Execution` block is followed in a standalone function
run.

### Parameters

- `request`: a short request supplied by the smoke runner

### Returns

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

### Parameters

- `request`: caller request

### Returns

- `plan`: a two-step plan based on the request

## finisher

### Parameters

- `plan`: plan from the planner

### Returns

- `result`: final output containing the exact phrase `execution-block-smoke-pass`
