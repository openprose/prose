---
name: oversight
kind: composite
---

# Oversight

Actor acts, observer evaluates independently, and arbiter decides whether to
continue, adjust, or abort.

### Requires

- `composite_state`: Json<OversightState> - actor, observer, arbiter, task brief, and max cycles

### Ensures

- `composite_result`: Json<OversightResult> - final outcome, observations, arbiter decisions, and cycle count

### Effects

- `pure`: deterministic topology pattern over declared state

### Execution

```prose
Give the actor the current task brief.
Give the observer only the actor outcome and original task.
Give the arbiter the observer report, not the actor's self-assessment.
If the arbiter says adjust, revise the next actor brief.
If the arbiter says abort, stop and return the reason.
Return final outcome with observations and decisions.
```
