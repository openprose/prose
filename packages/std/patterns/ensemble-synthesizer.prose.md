---
name: ensemble-synthesizer
kind: pattern
---

# Ensemble-Synthesizer

K services work independently on the same task. A synthesizer merges by reasoning about disagreements.

### Description

Fans out the same task to K independent services and synthesizes their results by reasoning about disagreements.

### Metadata

- `version`: 0.1.0

### Slots

- `ensemble_member` (primary)
  - requires: task_brief
  - ensures: result text
- `synthesizer`
  - requires: K member results, original task_brief
  - ensures: synthesized result with confidence assessment

### Config

- `ensemble_size` (integer, default: 3): Number of independent ensemble members to run

### Invariants

- All ensemble members receive the identical brief
- Synthesizer reasons about disagreements — it does not majority-vote
- Ensemble members are unaware of each other

### Shape

- `self`: fan out to K ensemble members, collect results, delegate to synthesizer
- `delegates`:
  - `ensemble_member`: produce a result given the brief — run K times
  - `synthesizer`: merge K results by reasoning about disagreements
- `prohibited`: none

### Requires

- Pattern instance receives:
    ensemble_member: string   -- service or system name for each ensemble member
    synthesizer: string       -- service or system name for the synthesizer
    task_brief: string        -- the task (same brief goes to all members)
    ensemble_size: number     -- (optional, default 3)

### Ensures

- All K members receive the SAME brief independently
- Synthesizer receives all K results — its job is NOT majority voting
- Synthesizer reasons about WHY results differ — disagreements are signal
  about ambiguity or difficulty
- Returns the synthesized result plus a confidence assessment
- `result`: the synthesis
- `member_results`: the K individual results

### Delegation

```prose
let member_results = parallel repeat ensemble_size:
  call ensemble_member
    task_brief: task_brief

let result = call synthesizer
  task_brief: task_brief
  member_results: member_results
  prompt: "Synthesize by reasoning about agreement, disagreement, and confidence; do not majority-vote."

return {
  result: result,
  member_results: member_results
}
```

### Notes

This is a seed pattern. Ensemble members do not know other services are working on the same task. The synthesizer does not know it is part of an ensemble pattern. Disagreement between members is the primary signal — it reveals ambiguity in the task, not errors in individual services.
