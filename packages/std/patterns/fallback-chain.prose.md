---
name: fallback-chain
kind: pattern
---

# Fallback Chain

Try delegate A. If it fails, try B. If B fails, try C. Ordered list of fallbacks with decreasing preference.

### Metadata

- `version`: 0.1.0
- `role`: coordinator

### Slots

- `chain`

### Config

- `failure_criteria` (string, default: none): Optional description of result-level failure conditions

### Invariants

- Chain entries run sequentially in declared preference order
- Each delegate receives the original brief, not failure context from earlier attempts
- The pattern stops immediately on the first success
- If every delegate fails, the result is `null` and failure history includes every attempt

### Shape

- `self`: try each delegate in order, return first success, stop on success
- `delegates`:
  - `fallback_1..fallback_N`: attempt the task
- `prohibited`: trying the next fallback when the current one succeeded

### Requires

- Pattern instance receives:
    chain: string[]         -- ordered list of service or system names (first = most preferred)
    task_brief: string      -- the task (same brief goes to each attempt)
    failure_criteria: string -- (optional) declarative description of what constitutes failure.
                                Default: only thrown errors count as failure.

### Ensures

- Delegates are tried sequentially in chain order
- First successful result is returned immediately — no further delegates are tried
- Each delegate receives the ORIGINAL brief — no failure context from prior attempts
- If all delegates fail: return null with full failure history
- `result`: the winning result, or `null`
- `winner`: the winning delegate name, or `null`
- `attempts`: number of delegates tried
- `failure_history`: reasons for each failed attempt

### Delegation

```prose
let failure_history = []

for delegate in chain:
  try:
    let candidate_result = call delegate
      task_brief: task_brief

    if failure_criteria says candidate_result is a failure:
      record { delegate: delegate, reason: "matched failure_criteria" } in failure_history
      continue

    return {
      result: candidate_result,
      winner: delegate,
      attempts: "number of attempted delegates",
      failure_history: failure_history
    }
  catch as error:
    record { delegate: delegate, reason: error } in failure_history

return {
  result: null,
  winner: null,
  attempts: chain.length,
  failure_history: failure_history
}
```

### Notes

Each delegate receives the original brief with no modification. Unlike `retry-with-learning`, fallback-chain does not pass failure context between attempts — each delegate gets a clean start. The assumption is that different delegates have different capabilities, not that the same delegate needs better instructions.

The chain order expresses preference. Put the best, most capable, or cheapest delegate first. Later delegates are fallbacks for when preferred options fail.

Different from `retry-with-learning`: retry retries the SAME service with enriched failure context. Fallback-chain tries DIFFERENT services with the original brief. A search service that returned no results should be retried with broader terms (retry-with-learning). A search service that is down should be replaced with an alternative (fallback-chain).

Different from `race`: race tries all candidates simultaneously. Fallback-chain tries them sequentially, only advancing on failure. Use fallback-chain when later candidates are expensive and should only run if cheaper ones fail. Use race when all candidates are worth trying in parallel.
