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
- pattern_instance.result contains the synthesis
- pattern_instance.member_results contains the K individual results

### Delegation

```javascript
const { ensemble_member, synthesizer, task_brief, ensemble_size = 3 } = pattern_instance;

// Fan out to K members — each works independently
const memberResults = [];
for (let i = 0; i < ensemble_size; i++) {
  const result = await rlm(task_brief, null, { use: ensemble_member });
  memberResults.push(result);
}

// Synthesizer merges
const synthBrief = `${ensemble_size} independent services worked on the same task. Reason about their results — where they agree, where they disagree, and why.\n\nOriginal task: ${task_brief}\n\nResults:\n${memberResults.map((r, i) => `--- Member ${i + 1} ---\n${r}`).join("\n\n")}`;
const synthesis = await rlm(synthBrief, null, { use: synthesizer });

pattern_instance.result = synthesis;
pattern_instance.member_results = memberResults;
return(synthesis);
```

### Notes

This is a seed pattern. Ensemble members do not know other services are working on the same task. The synthesizer does not know it is part of an ensemble pattern. Disagreement between members is the primary signal — it reveals ambiguity in the task, not errors in individual services.
