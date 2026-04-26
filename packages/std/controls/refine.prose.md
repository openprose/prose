---
name: refine
kind: composite
---

# Refine

Iteratively improve a result until it reaches a quality threshold or the round
budget is exhausted.

### Requires

- `control_state`: Json<RefineControlState> - refiner, evaluator, task brief, max rounds, and threshold

### Ensures

- `control_result`: Json<RefineControlResult> - final result, score, rounds used, and evaluator feedback

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Ask the refiner for an initial result.
Ask the evaluator to score the result and provide concrete improvement guidance.
Stop when score meets threshold.
Otherwise give the refiner the prior result, score, and improvement guidance.
Repeat until threshold or max rounds.
Return the final result with score and round metadata.
```
