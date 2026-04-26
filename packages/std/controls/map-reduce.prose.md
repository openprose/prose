---
name: map-reduce
kind: composite
---

# Map-Reduce

Split work across mapper calls, then merge mapper outputs through a reducer.

### Requires

- `control_state`: Json<MapReduceControlState> - mapper, reducer, task brief, chunks, and merge requirements

### Ensures

- `control_result`: Json<MapReduceControlResult> - merged result, mapper outputs, and reducer notes

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Validate that chunks is non-empty.
Give each mapper one chunk plus the overall task context.
Keep mapper calls independent.
Give the reducer every mapper output, the task brief, and merge requirements.
Require the reducer to resolve conflicts or mark unresolved disagreements.
Return the reducer output plus mapper provenance.
```
