---
name: worker-critic
kind: pattern
---

# Worker-Critic

One worker works, another evaluates. Retry until the critic accepts or budget exhausts.

### Description

Iteratively refines a worker's output by looping through critic evaluation until acceptance or budget exhaustion.

### Metadata

- `version`: 0.1.0

### Slots

- `worker` (primary)
  - requires: task_brief, optional critique from previous attempt
  - ensures: result text
- `critic`
  - requires: worker result, original task_brief, criteria
  - ensures: structured verdict with accept/reject, reasoning, issues, suggestions

### Config

- `max_rounds` (integer, default: 3): Maximum number of worker-critic cycles before returning best attempt

### Invariants

- Worker never sees the raw criteria — only the critique derived from them
- Critic always receives the original task brief alongside the result
- On accept the loop exits immediately and returns the worker's result
- After max_rounds exhausted the final attempt is returned with its critique

### Shape

- `self`: manage retry loop, pass critique to worker, return accepted result
- `delegates`:
  - `worker`: produce result from brief
  - `critic`: evaluate result against criteria
- `prohibited`: none

### Requires

- Pattern instance receives:
    worker: string        -- function or responsibility name to use as worker
    critic: string        -- function or responsibility name to use as critic
    task_brief: string    -- the task to pass to the worker
    criteria: string      -- acceptance criteria for the critic
    max_rounds: number    -- (optional, default 3)

### Returns

- Worker receives only the task brief (first attempt) or task brief + critique (retries)
- Critic receives the worker's result AND the original task brief AND the criteria
- Critic returns { verdict: "accept" | "reject", reasoning, issues, suggestions }
- On reject: worker receives the critique as learning signal — not the raw task repeated
- On accept: return the worker's result immediately
- After max_rounds exhausted: return the best attempt with the final critique
- `result`: the final output
- `attempts`: number of worker attempts
- `final_critique`: final critic response when the round budget is exhausted

### Delegation

```prose
let last_result = null
let last_critique = null

repeat max_rounds as attempt:
  let last_result = call worker
    task_brief: task_brief
    critique: last_critique

  let verdict = call critic
    output: last_result
    task_brief: task_brief
    criteria: criteria

  if verdict accepts result:
    return {
      result: last_result,
      attempts: attempt
    }

  last_critique = verdict

return {
  result: last_result,
  attempts: max_rounds,
  final_critique: last_critique
}
```

### Notes

This is a seed pattern in the standard library. The worker does not know it will be critiqued. The critic does not know its verdict triggers a retry. Multi-polarity is managed here, not in the slot services.
