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
- pattern_instance.result contains the winning result (or null)
- pattern_instance.winner contains the winning delegate's name (or null)
- pattern_instance.attempts contains the number of delegates tried
- pattern_instance.failure_history contains reasons for each failed attempt

### Delegation

```javascript
const { chain, task_brief, failure_criteria } = pattern_instance;
const failures = [];

for (let i = 0; i < chain.length; i++) {
  try {
    const result = await rlm(task_brief, null, { use: chain[i] });

    // Evaluate failure_criteria if provided
    if (failure_criteria) {
      const evalBrief = `Does this result satisfy the failure criteria?\n\nCriteria: "${failure_criteria}"\n\nResult:\n${String(result).slice(0, 2000)}\n\nRespond with JSON: { "is_failure": true/false, "reason": "..." }`;
      const evalResult = await rlm(evalBrief, null, {});
      try {
        const jsonMatch = String(evalResult).match(/\{[\s\S]*"is_failure"[\s\S]*\}/);
        const evaluation = JSON.parse(jsonMatch[0]);
        if (evaluation.is_failure) {
          failures.push({ delegate: chain[i], reason: evaluation.reason });
          continue;
        }
      } catch {
        // Unparseable evaluation — treat as success (fail open)
      }
    }

    pattern_instance.result = result;
    pattern_instance.winner = chain[i];
    pattern_instance.attempts = i + 1;
    pattern_instance.failure_history = failures;
    return(result);
  } catch (e) {
    failures.push({ delegate: chain[i], reason: e.message });
  }
}

// All delegates failed
pattern_instance.result = null;
pattern_instance.winner = null;
pattern_instance.attempts = chain.length;
pattern_instance.failure_history = failures;
return(null);
```

### Notes

Each delegate receives the original brief with no modification. Unlike `retry-with-learning`, fallback-chain does not pass failure context between attempts — each delegate gets a clean start. The assumption is that different delegates have different capabilities, not that the same delegate needs better instructions.

The chain order expresses preference. Put the best, most capable, or cheapest delegate first. Later delegates are fallbacks for when preferred options fail.

Different from `retry-with-learning`: retry retries the SAME service with enriched failure context. Fallback-chain tries DIFFERENT services with the original brief. A search service that returned no results should be retried with broader terms (retry-with-learning). A search service that is down should be replaced with an alternative (fallback-chain).

Different from `race`: race tries all candidates simultaneously. Fallback-chain tries them sequentially, only advancing on failure. Use fallback-chain when later candidates are expensive and should only run if cheaper ones fail. Use race when all candidates are worth trying in parallel.
