---
name: pipeline
kind: pattern
---

# Pipeline

Sequential transformation through multiple stages. Each stage sees only its predecessor's output.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Slots

- `stages`

### Config

- None. Stage order is determined by the `stages` slot binding.

### Invariants

- Stages run sequentially in declared order
- Stage 1 receives the original task brief
- Each later stage receives only the previous stage's output
- The pattern does not curate, merge, or recover context between stages

### Shape

- `self`: pass output of each stage as input to the next, no curation between stages
- `delegates`:
  - `stage_1..stage_N`: transform input to output
- `prohibited`: none

### Requires

- Pattern instance receives:
    stages: string[]       -- ordered list of service or system names
    task_brief: string     -- initial input (goes to stage 1)

### Ensures

- Stage 1 receives the task brief as its input
- Stage N receives stage N-1's output as its input — not the original brief
- The pipeline does NOT curate between stages — it is a pure pass-through
- If curation is needed: insert a role (e.g., summarizer) as an explicit stage
- Each stage operates on a clean interface — no accumulated context
- pattern_instance.result contains the final stage's output
- pattern_instance.stage_outputs contains each stage's output

### Delegation

```javascript
const { stages, task_brief } = pattern_instance;
const stageOutputs = [];
let currentInput = task_brief;

for (let i = 0; i < stages.length; i++) {
  const output = await rlm(currentInput, null, { use: stages[i] });
  stageOutputs.push(output);
  currentInput = String(output);
}

pattern_instance.result = currentInput;
pattern_instance.stage_outputs = stageOutputs;
return(currentInput);
```

### Notes

No stage knows it is part of a pipeline. Each receives input and produces output. The isolation between stages is the structural guarantee — each stage operates on a clean interface defined solely by its predecessor's output. If stage 3 needs information from stage 1, insert an intermediate stage that carries it forward, or restructure the pipeline.
