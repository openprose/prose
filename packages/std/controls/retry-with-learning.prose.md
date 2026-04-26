---
name: retry-with-learning
kind: composite
---

# Retry With Learning

Retry the same target with accumulated failure context after each failed
attempt.

### Requires

- `control_state`: Json<RetryWithLearningControlState> - target, task brief, retry budget, and failure criteria

### Ensures

- `control_result`: Json<RetryWithLearningControlResult> - final result, success flag, attempts, and failure history

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Call the target with the original task brief on the first attempt.
Classify failures using explicit failure criteria when provided.
After each failure, summarize what failed and what should change.
Retry the same target with the original task plus accumulated failure analysis.
Stop on the first success or when retry budget is exhausted.
Return result and failure history.
```
