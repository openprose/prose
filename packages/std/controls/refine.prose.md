---
name: refine
kind: composite
---

# Refine

Iteratively improve a result through delegation rounds until a quality threshold is met.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Runtime

- `state.reads`: &controlState
- `state.writes`: &controlState

### Slots

- `refiner`
- `evaluator`

### Shape

- `self`: manage refinement rounds, pass evaluator feedback to refiner
- `delegates`:
  - `refiner`: produce or improve a result
  - `evaluator`: score the result 0..1 and suggest improvements
- `prohibited`: none

### Requires

- &controlState exists at __controlState with:
    refiner: string        -- component name for the refiner
    evaluator: string      -- component name for the evaluator
    task_brief: string     -- the task
    max_rounds: number     -- (optional, default 3)
    threshold: number      -- (optional, default 0.8) score at which to stop

### Ensures

- Round 1: refiner produces initial result from the task brief
- Evaluator scores the result (0..1) and provides specific improvement suggestions
- If score >= threshold: return immediately
- If score < threshold: refiner receives the result, score, and suggestions
- Each round accumulates improvement — refiner sees its own prior output
- Returns when threshold met or max_rounds exhausted
- &controlState.result contains the final output
- &controlState.score contains the final score
- &controlState.rounds_used contains the number of rounds

### Delegation Loop

```javascript
const { refiner, evaluator, task_brief, max_rounds = 3, threshold = 0.8 } = __controlState;
let currentResult = null;
let currentScore = 0;
let roundsUsed = 0;

for (let round = 0; round < max_rounds; round++) {
  roundsUsed = round + 1;

  // Refiner produces or improves
  let refinerBrief = round === 0
    ? task_brief
    : `Improve this result. Current score: ${currentScore}.\n\nOriginal task: ${task_brief}\n\nCurrent result:\n${currentResult}\n\nImprovement suggestions:\n${__controlState._lastSuggestions}`;

  currentResult = await rlm(refinerBrief, null, { use: refiner });

  // Evaluator scores
  const evalBrief = `Score this result from 0 to 1 and provide specific improvement suggestions.\n\nTask: ${task_brief}\n\nResult:\n${currentResult}`;
  const evaluation = await rlm(evalBrief, null, { use: evaluator });

  // Parse score from evaluation
  const scoreMatch = String(evaluation).match(/(\d+\.?\d*)/);
  currentScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
  if (currentScore > 1) currentScore = currentScore / 100; // handle percentage
  __controlState._lastSuggestions = evaluation;

  if (currentScore >= threshold) break;
}

__controlState.result = currentResult;
__controlState.score = currentScore;
__controlState.rounds_used = roundsUsed;
return(currentResult);
```

### Notes

The refiner does not know it is in a refinement loop. The evaluator does not know its score controls iteration.

Different from `retry-with-learning`: refinement improves work that is mediocre — the result exists but is not good enough. Retry-with-learning recovers from failure — the result is broken or absent. Refinement uses a continuous quality score (0..1) and improvement suggestions. Retry uses binary failure detection and failure analysis. A result that scores 0.4 needs refinement. A result that throws an error or returns nothing needs retry.
