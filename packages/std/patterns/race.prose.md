---
name: race
kind: pattern
---

# Race

Multiple delegates work on the same task in parallel. First acceptable result wins. Others are cancelled.

### Metadata

- `version`: 0.1.0
- `role`: coordinator

### Slots

- `candidates`

### Config

- `acceptance_criteria` (string, default: none): Optional description of what makes a candidate result acceptable

### Invariants

- Every candidate receives the same task brief
- Candidates run independently and do not see each other's outputs
- The first acceptable result wins; if multiple results are available, earlier slot order breaks ties
- If no candidate is acceptable, the pattern returns `null` with no winner

### Shape

- `self`: dispatch same brief to all candidates, accept first good result, cancel rest
- `delegates`:
  - `candidate_1..candidate_N`: attempt the task
- `prohibited`: waiting for all candidates when one has already succeeded

### Parameters

- Pattern instance receives:
    candidates: string[]    -- responsibility or function names for each candidate
    task_brief: string      -- the task (same brief goes to all candidates)
    acceptance_criteria: string -- (optional) declarative description of what makes a result
                                  acceptable. Default: any non-error result is accepted.

### Returns

- `result`: the winning result, or `null`
- `winner`: the winning candidate name, or `null`
- `attempts`: number of candidates that completed before a winner
- `failure_history`: rejected or failed candidate attempts

All candidates received the same brief and started in parallel, and no candidate knew the others existed. The returned `result` is the first candidate result that met the acceptance criteria, returned immediately with the remaining candidates cancelled (best-effort); if no candidate produced an acceptable result, `result` and `winner` are `null` and every attempt is recorded in `failure_history`.

### Delegation

```prose
let attempts = parallel for candidate in candidates:
  try:
    let candidate_result = call candidate
      task_brief: task_brief
    return {
      candidate: candidate,
      result: candidate_result,
      error: null
    }
  catch as error:
    return {
      candidate: candidate,
      result: null,
      error: error
    }

for attempt in attempts:
  if attempt.error is present:
    continue

  if acceptance_criteria says attempt.result is acceptable:
    return {
      result: attempt.result,
      winner: attempt.candidate,
      attempts: "number of completed attempts before winner",
      failure_history: attempts
    }

return {
  result: null,
  winner: null,
  attempts: candidates.length,
  failure_history: attempts
}
```

### Notes

No candidate knows other candidates exist. Each receives the same brief and works independently.

True cancellation depends on the runtime. In environments without preemption, all candidates run to completion and the first acceptable result (in preference order) wins. The `candidates` array order expresses preference — if two candidates both succeed, the earlier-listed one wins.

Different from `fan-out`: fan-out waits for ALL results and returns the full collection. Race returns the FIRST acceptable result. Use race for speculative execution, redundancy, or when multiple approaches might work but you only need one.

Different from `fallback-chain`: fallback-chain tries candidates sequentially (A, then B if A fails, then C). Race tries all candidates simultaneously. Use fallback-chain when later candidates are cheaper or less preferred and should only run if earlier ones fail. Use race when all candidates are worth trying in parallel.
