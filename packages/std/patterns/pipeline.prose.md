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
- `result`: the final stage's output
- `stage_outputs`: each stage's output

### Delegation

```prose
let current_input = task_brief
let stage_outputs = []

for stage in stages:
  let current_input = call stage
    input: current_input
  record current_input in stage_outputs

return {
  result: current_input,
  stage_outputs: stage_outputs
}
```

### Notes

No stage knows it is part of a pipeline. Each receives input and produces output. The isolation between stages is the structural guarantee — each stage operates on a clean interface defined solely by its predecessor's output. If stage 3 needs information from stage 1, insert an intermediate stage that carries it forward, or restructure the pipeline.
