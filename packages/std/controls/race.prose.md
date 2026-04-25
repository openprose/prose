---
name: race
kind: composite
---

# Race

Multiple delegates work on the same task in parallel. First acceptable result wins. Others are cancelled.

### Metadata

- `version`: 0.1.0
- `role`: coordinator

### Runtime

- `state.reads`: &controlState
- `state.writes`: &controlState

### Slots

- `candidates`

### Shape

- `self`: dispatch same brief to all candidates, accept first good result, cancel rest
- `delegates`:
  - `candidate_1..candidate_N`: attempt the task
- `prohibited`: waiting for all candidates when one has already succeeded

### Requires

- &controlState exists at __controlState with:
    candidates: string[]    -- component names for each candidate
    task_brief: string      -- the task (same brief goes to all candidates)
    acceptance_criteria: string -- (optional) declarative description of what makes a result
                                  acceptable. Default: any non-error result is accepted.

### Ensures

- All candidates receive the same brief and start in parallel
- First result that meets acceptance criteria is returned immediately
- Remaining candidates are cancelled (best-effort)
- No candidate knows other candidates exist
- If no candidate produces an acceptable result: return null with all attempts in failure_history
- &controlState.result contains the winning result (or null)
- &controlState.winner contains the winning candidate's name (or null)
- &controlState.attempts contains the number of candidates that completed before a winner


### Effects

- `pure`: deterministic transformation over declared inputs

### Delegation

```javascript
const { candidates, task_brief, acceptance_criteria } = __controlState;

// All candidates race in parallel
const results = await Promise.all(
  candidates.map(async (candidate) => {
    try {
      const result = await rlm(task_brief, null, { use: candidate });
      return { candidate, result, error: null };
    } catch (e) {
      return { candidate, result: null, error: e.message };
    }
  })
);

// Evaluate results in order of candidate preference (first in list = highest preference)
for (const entry of results) {
  if (entry.error) continue;

  if (acceptance_criteria) {
    const evalBrief = `Does this result meet the acceptance criteria?\n\nCriteria: "${acceptance_criteria}"\n\nResult:\n${String(entry.result).slice(0, 2000)}\n\nRespond with JSON: { "acceptable": true/false }`;
    const evalResult = await rlm(evalBrief, null, {});
    try {
      const jsonMatch = String(evalResult).match(/\{[\s\S]*"acceptable"[\s\S]*\}/);
      const evaluation = JSON.parse(jsonMatch[0]);
      if (!evaluation.acceptable) continue;
    } catch {
      // Unparseable evaluation — treat as acceptable (fail open)
    }
  }

  __controlState.result = entry.result;
  __controlState.winner = entry.candidate;
  __controlState.attempts = results.indexOf(entry) + 1;
  return(entry.result);
}

// No winner
__controlState.result = null;
__controlState.winner = null;
__controlState.attempts = candidates.length;
return(null);
```

### Notes

No candidate knows other candidates exist. Each receives the same brief and works independently.

True cancellation depends on the runtime. In environments without preemption, all candidates run to completion and the first acceptable result (in preference order) wins. The `candidates` array order expresses preference — if two candidates both succeed, the earlier-listed one wins.

Different from `fan-out`: fan-out waits for ALL results and returns the full collection. Race returns the FIRST acceptable result. Use race for speculative execution, redundancy, or when multiple approaches might work but you only need one.

Different from `fallback-chain`: fallback-chain tries candidates sequentially (A, then B if A fails, then C). Race tries all candidates simultaneously. Use fallback-chain when later candidates are cheaper or less preferred and should only run if earlier ones fail. Use race when all candidates are worth trying in parallel.
