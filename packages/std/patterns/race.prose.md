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

### Requires

- Pattern instance receives:
    candidates: string[]    -- service or system names for each candidate
    task_brief: string      -- the task (same brief goes to all candidates)
    acceptance_criteria: string -- (optional) declarative description of what makes a result
                                  acceptable. Default: any non-error result is accepted.

### Ensures

- All candidates receive the same brief and start in parallel
- First result that meets acceptance criteria is returned immediately
- Remaining candidates are cancelled (best-effort)
- No candidate knows other candidates exist
- If no candidate produces an acceptable result: return null with all attempts in failure_history
- pattern_instance.result contains the winning result (or null)
- pattern_instance.winner contains the winning candidate's name (or null)
- pattern_instance.attempts contains the number of candidates that completed before a winner

### Delegation

```javascript
const { candidates, task_brief, acceptance_criteria } = pattern_instance;

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

  pattern_instance.result = entry.result;
  pattern_instance.winner = entry.candidate;
  pattern_instance.attempts = results.indexOf(entry) + 1;
  return(entry.result);
}

// No winner
pattern_instance.result = null;
pattern_instance.winner = null;
pattern_instance.attempts = candidates.length;
return(null);
```

### Notes

No candidate knows other candidates exist. Each receives the same brief and works independently.

True cancellation depends on the runtime. In environments without preemption, all candidates run to completion and the first acceptable result (in preference order) wins. The `candidates` array order expresses preference — if two candidates both succeed, the earlier-listed one wins.

Different from `fan-out`: fan-out waits for ALL results and returns the full collection. Race returns the FIRST acceptable result. Use race for speculative execution, redundancy, or when multiple approaches might work but you only need one.

Different from `fallback-chain`: fallback-chain tries candidates sequentially (A, then B if A fails, then C). Race tries all candidates simultaneously. Use fallback-chain when later candidates are cheaper or less preferred and should only run if earlier ones fail. Use race when all candidates are worth trying in parallel.
