---
name: worker-critic
kind: pattern
---

# Worker-Critic

One service works, another evaluates. Retry until the critic accepts or budget exhausts.

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
    worker: string        -- service or system name to use as worker
    critic: string        -- service or system name to use as critic
    task_brief: string    -- the task to pass to the worker
    criteria: string      -- acceptance criteria for the critic
    max_rounds: number    -- (optional, default 3)

### Ensures

- Worker receives only the task brief (first attempt) or task brief + critique (retries)
- Critic receives the worker's result AND the original task brief AND the criteria
- Critic returns { verdict: "accept" | "reject", reasoning, issues, suggestions }
- On reject: worker receives the critique as learning signal — not the raw task repeated
- On accept: return the worker's result immediately
- After max_rounds exhausted: return the best attempt with the final critique
- pattern_instance.result contains the final output
- pattern_instance.attempts contains the count

### Delegation

```javascript
const { worker, critic, task_brief, criteria, max_rounds = 3 } = pattern_instance;
let lastResult = null;
let lastCritique = null;

for (let attempt = 0; attempt < max_rounds; attempt++) {
  // Build worker brief
  let workerBrief = task_brief;
  if (lastCritique) {
    workerBrief += `\n\nPrevious attempt was rejected.\nCritique: ${lastCritique.reasoning}`;
    if (lastCritique.suggestions?.length) {
      workerBrief += `\nSuggestions: ${lastCritique.suggestions.join("; ")}`;
    }
  }

  lastResult = await rlm(workerBrief, null, { use: worker });

  // Build critic brief
  const criticBrief = `Evaluate this result against the criteria.\n\nOriginal task: ${task_brief}\nCriteria: ${criteria}\n\nResult to evaluate:\n${lastResult}`;
  const verdict = await rlm(criticBrief, null, { use: critic });

  // Parse verdict — critic should return structured assessment
  if (verdict?.verdict === "accept" || /accept/i.test(String(verdict))) {
    pattern_instance.result = lastResult;
    pattern_instance.attempts = attempt + 1;
    return(lastResult);
  }

  lastCritique = verdict;
}

pattern_instance.result = lastResult;
pattern_instance.attempts = max_rounds;
pattern_instance.final_critique = lastCritique;
return(lastResult);
```

### Notes

This is a seed pattern in the standard library. The worker does not know it will be critiqued. The critic does not know its verdict triggers a retry. Multi-polarity is managed here, not in the slot services.
