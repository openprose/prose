---
name: ratchet
kind: composite
---

# Ratchet

Advance only when a certifier accepts the step. Certified progress is monotonic
and never rolled back.

### Requires

- `composite_state`: Json<RatchetState> - advancer, certifier, task brief, certified progress, and max steps

### Ensures

- `composite_result`: Json<RatchetResult> - certified progress, rejected proposals, and final status

### Effects

- `pure`: deterministic topology pattern over declared state

### Execution

```prose
Give the advancer the goal and certified progress so far.
Give the certifier the proposed step, goal, and certified progress.
Append accepted steps to certified progress.
Discard rejected steps and pass rejection feedback to the next advancer attempt.
Never remove certified progress.
Return certified progress and rejection history.
```
