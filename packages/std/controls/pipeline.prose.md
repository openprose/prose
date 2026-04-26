---
name: pipeline
kind: composite
---

# Pipeline

Sequential transformation through ordered stages. Each stage receives only the
previous stage's output.

### Requires

- `control_state`: Json<PipelineControlState> - stages, initial task, and optional per-stage labels

### Ensures

- `control_result`: Json<PipelineControlResult> - final result, ordered stage outputs, and stage metadata

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Validate that control_state.stages is non-empty and ordered.
Pass the initial task to the first stage.
For every later stage, pass only the previous stage output unless the state explicitly carries additional context.
Record every stage output in order.
Return the last stage output as control_result.result.
```
