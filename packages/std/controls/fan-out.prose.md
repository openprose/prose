---
name: fan-out
kind: composite
---

# Fan-Out

Parallel delegation without reduction. The parent receives all raw results and
decides how to interpret them.

### Requires

- `control_state`: Json<FanOutControlState> - delegates and either one broadcast brief or one brief per delegate

### Ensures

- `control_result`: Json<FanOutControlResult> - ordered delegate results and completion metadata

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Validate that delegates is non-empty.
Normalize briefs so each delegate has exactly one brief.
Run delegates independently with no knowledge of one another.
Collect every result in delegate order.
Do not merge, rank, or summarize results.
Return control_result.
```
