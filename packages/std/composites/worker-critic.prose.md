---
name: worker-critic
kind: composite
---

# Worker-Critic

Worker produces, critic evaluates, and the loop repeats until accepted or the
round budget is exhausted.

### Requires

- `composite_state`: Json<WorkerCriticState> - worker, critic, task brief, criteria, and max rounds

### Ensures

- `composite_result`: Json<WorkerCriticResult> - final result, attempts, verdicts, and final critique

### Effects

- `pure`: deterministic topology pattern over declared state

### Execution

```prose
Give the worker the task brief for the first attempt.
Give the critic the worker result, original task, and criteria.
On rejection, pass critique and suggestions back to the worker.
Stop immediately on acceptance.
After max rounds, return the final attempt and final critique.
Return composite_result.
```
