---
name: retry-with-learning
kind: composite
---

# Retry With Learning

Retry a component, passing failure analysis to each subsequent attempt. Each retry differs because it receives the history of all prior failures.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Runtime

- `state.reads`: &controlState
- `state.writes`: &controlState

### Slots

- `target`

### Shape

- `self`: analyze failures, enrich briefs with failure history, track attempts
- `delegates`:
  - `target`: execute the task
- `prohibited`: none

### Requires

- &controlState exists at __controlState with:
    target: string          -- component name to retry
    task_brief: string      -- the original task
    max_retries: number     -- (optional, default 3)
    failure_criteria: string -- (optional) declarative description of what constitutes failure.
                                The coordinator interprets this against the result.
                                e.g., "result contains 'no results found' or is empty"
                                Default: retry on thrown error only.

### Ensures

- First attempt: target receives the original brief
- On failure: analyze what went wrong, construct enriched brief with:
    original task, what was tried, why it failed, what to try differently
- Each retry receives the FULL failure history, not just the last attempt
- Returns on first success
- After max_retries: returns the last result with &controlState.failure_history
- &controlState.result contains the final output
- &controlState.attempts contains the attempt count
- &controlState.failure_history contains analysis of each failed attempt

### Delegation Loop

```javascript
const { target, task_brief, max_retries = 3, failure_criteria } = __controlState;
const failures = [];

for (let attempt = 0; attempt < max_retries; attempt++) {
  let brief = task_brief;
  if (failures.length > 0) {
    brief += `\n\nPrior attempts failed. You MUST try a different approach.\n`;
    failures.forEach((f, i) => {
      brief += `\nAttempt ${i + 1}: ${f.summary}\nFailure reason: ${f.reason}\n`;
    });
  }

  try {
    const result = await rlm(brief, null, { use: target });

    // Evaluate failure_criteria declaratively against the result
    if (failure_criteria) {
      const evalBrief = `Does this result satisfy the failure criteria? Criteria: "${failure_criteria}"\n\nResult:\n${String(result).slice(0, 2000)}\n\nRespond with JSON: { "is_failure": true/false, "reason": "..." }`;
      const evalResult = await rlm(evalBrief, null, {});
      try {
        const jsonMatch = String(evalResult).match(/\{[\s\S]*"is_failure"[\s\S]*\}/);
        const evaluation = JSON.parse(jsonMatch[0]);
        if (evaluation.is_failure) {
          failures.push({ summary: String(result).slice(0, 200), reason: evaluation.reason });
          continue;
        }
      } catch {
        // If evaluation is unparseable, treat as success — fail open on ambiguity
      }
    }

    __controlState.result = result;
    __controlState.attempts = attempt + 1;
    __controlState.failure_history = failures;
    return(result);
  } catch (e) {
    failures.push({ summary: `Error: ${e.message}`, reason: e.message });
  }
}

__controlState.result = null;
__controlState.attempts = max_retries;
__controlState.failure_history = failures;
return(null);
```

### Notes

The target component does not know it is being retried. Each invocation looks like a fresh delegation — the failure history appears as context in the brief, not as retry metadata.

The `failure_criteria` parameter is a declarative string, not a function. The coordinator interprets it against the result using natural language evaluation, consistent with Prose's file-based contract model. Examples: `"result contains 'error' or is empty"`, `"result does not include a valid URL"`, `"result has fewer than 3 items"`.

Different from `refine`: retry-with-learning recovers from failure — the result is broken, empty, or wrong. Refinement improves mediocrity — the result exists but is not good enough. Retry passes failure analysis. Refinement passes improvement suggestions. A result that throws an error needs retry. A result that scores 0.4 needs refinement.

Different from `fallback-chain`: retry-with-learning retries the SAME component with enriched context. Fallback-chain tries DIFFERENT components in preference order.
