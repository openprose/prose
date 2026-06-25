---
name: refine
kind: pattern
version: 0.15.0
---

# Refine

Iteratively improve a result through delegation rounds until a quality threshold is met.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Slots

- `refiner`
- `evaluator`

### Config

- `max_rounds` (integer, default: 3): Maximum number of refinement rounds
- `threshold` (number, default: 0.8): Score at which the result is accepted

### Shape

- `self`: manage refinement rounds, pass evaluator feedback to refiner
- `delegates`:
  - `refiner`: produce or improve a result
  - `evaluator`: score the result 0..1 and suggest improvements
- `prohibited`: none

### Requires

- Pattern instance receives:
    refiner: string        -- service or system name for the refiner
    evaluator: string      -- service or system name for the evaluator
    task_brief: string     -- the task
    max_rounds: number     -- (optional, default 3)
    threshold: number      -- (optional, default 0.8) score at which to stop

### Invariants

- The loop is bounded by `max_rounds`
- The evaluator scores only the current result against the original task
- The refiner receives its prior output and evaluator feedback on retries
- The final output is the first result meeting `threshold`, or the last attempted result when the budget is exhausted
- Round 1: refiner produces initial result from the task brief
- Evaluator scores the result (0..1) and provides specific improvement suggestions
- If score >= threshold: return immediately
- If score < threshold: refiner receives the result, score, and suggestions
- Each round accumulates improvement — refiner sees its own prior output
- Returns when threshold met or max_rounds exhausted
- `result`: the final output
- `score`: the final score
- `rounds_used`: number of rounds

### Delegation

```prose
let current_result = null
let current_score = 0
let improvement_suggestions = null

repeat max_rounds as round:
  let current_result = call refiner
    task_brief: task_brief
    current_result: current_result
    current_score: current_score
    improvement_suggestions: improvement_suggestions

  let evaluation = call evaluator
    task_brief: task_brief
    result: current_result

  current_score = evaluation.score
  improvement_suggestions = evaluation.suggestions

  if current_score meets threshold:
    return {
      result: current_result,
      score: current_score,
      rounds_used: round
    }

return {
  result: current_result,
  score: current_score,
  rounds_used: max_rounds
}
```

### Notes

The refiner does not know it is in a refinement loop. The evaluator does not know its score drives iteration.

Different from `retry-with-learning`: refinement improves work that is mediocre — the result exists but is not good enough. Retry-with-learning recovers from failure — the result is broken or absent. Refinement uses a continuous quality score (0..1) and improvement suggestions. Retry uses binary failure detection and failure analysis. A result that scores 0.4 needs refinement. A result that throws an error or returns nothing needs retry.
