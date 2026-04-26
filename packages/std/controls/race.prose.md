---
name: race
kind: composite
---

# Race

Run candidates against the same task and accept the first result that satisfies
the acceptance criteria.

### Requires

- `control_state`: Json<RaceControlState> - candidates, task brief, acceptance criteria, and cancellation preference

### Ensures

- `control_result`: Json<RaceControlResult> - winner, winning result, rejected results, and cancellation notes

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Validate that candidates is non-empty.
Give every candidate the same task brief.
Accept the first candidate result that satisfies acceptance criteria.
Cancel or ignore remaining candidates according to runtime capability.
If no candidate is acceptable, return null result with failure history.
Return control_result.
```
