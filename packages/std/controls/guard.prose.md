---
name: guard
kind: composite
---

# Guard

Check a precondition before delegating to an expensive or unsafe target.

### Requires

- `control_state`: Json<GuardControlState> - guard, target, task brief, and proceed criteria

### Ensures

- `control_result`: Json<GuardControlResult> - proceeded flag, guard reason, target result when allowed

### Effects

- `pure`: deterministic coordination pattern over declared state

### Execution

```prose
Ask the guard whether the task should proceed.
Require the guard to return a structured proceed decision and reason.
If the guard does not clearly approve, stop before calling the target.
If approved, pass the original task brief to the target unchanged.
Return the target result or the guard block reason.
```
