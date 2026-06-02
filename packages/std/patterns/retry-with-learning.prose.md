---
name: retry-with-learning
kind: pattern
---

# Retry With Learning

Retry a service, passing failure analysis to each subsequent attempt. Each retry differs because it receives the history of all prior failures.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Slots

- `target`

### Config

- `max_retries` (integer, default: 3): Maximum number of attempts against the target slot
- `failure_criteria` (string, default: none): Optional description of result-level failure conditions

### Invariants

- The retry loop is bounded by `max_retries`
- Each retry uses the same target slot
- Failure history is cumulative and available to every retry after the first
- The pattern stops at the first success or returns `null` with failure history after exhaustion

### Shape

- `self`: analyze failures, enrich briefs with failure history, track attempts
- `delegates`:
  - `target`: execute the task
- `prohibited`: none

### Requires

- Pattern instance receives:
    target: string          -- service or system name to retry
    task_brief: string      -- the original task
    max_retries: number     -- (optional, default 3)
    failure_criteria: string -- (optional) declarative description of what constitutes failure.
                                The coordinator interprets this against the result.
                                e.g., "result contains 'no results found' or is empty"
                                Default: retry on thrown error only.

### Returns

- `result`: the final output, or `null` after exhaustion
- `attempts`: attempt count
- `failure_history`: analysis of each failed attempt

The returned value satisfies these guarantees: the first attempt's target receives the original brief; on failure the coordinator analyzes what went wrong and constructs an enriched brief (original task, what was tried, why it failed, what to try differently); each retry receives the FULL failure history, not just the last attempt; the value is returned on first success; and after `max_retries` the returned `result` is the last result accompanied by its `failure_history`.

### Delegation

```prose
let failure_history = []

repeat max_retries as attempt:
  try:
    let result = call target
      task_brief: task_brief
      failure_history: failure_history

    if failure_criteria says result is a failure:
      record { attempt: attempt, result: result, reason: "matched failure_criteria" } in failure_history
      continue

    return {
      result: result,
      attempts: attempt,
      failure_history: failure_history
    }
  catch as error:
    record { attempt: attempt, reason: error } in failure_history

return {
  result: null,
  attempts: max_retries,
  failure_history: failure_history
}
```

### Notes

The target service does not know it is being retried. Each invocation looks like a fresh delegation — the failure history appears as context in the brief, not as retry metadata.

The `failure_criteria` parameter is a declarative string, not a function. The coordinator interprets it against the result using natural language evaluation, consistent with Prose's file-based contract model. Examples: `"result contains 'error' or is empty"`, `"result does not include a valid URL"`, `"result has fewer than 3 items"`.

Different from `refine`: retry-with-learning recovers from failure — the result is broken, empty, or wrong. Refinement improves mediocrity — the result exists but is not good enough. Retry passes failure analysis. Refinement passes improvement suggestions. A result that throws an error needs retry. A result that scores 0.4 needs refinement.

Different from `fallback-chain`: retry-with-learning retries the SAME service with enriched context. Fallback-chain tries DIFFERENT services in preference order.
