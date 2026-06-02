---
name: oversight
kind: pattern
---

# Oversight

Actor acts, observer watches outcomes independently, arbiter decides next step based on the observer's report — not the actor's self-assessment.

### Description

Actor executes, observer independently analyzes outcomes, arbiter decides whether to continue, adjust, or abort.

### Metadata

- `version`: 0.1.0

### Slots

- `actor` (primary)
  - requires: task_brief, adjustment (if prior cycle was adjusted)
  - ensures: execution outcome
- `observer`
  - requires: task_brief, actor outcome
  - ensures: independent analysis of the outcome
- `arbiter`
  - requires: task_brief, observer report
  - ensures: {'decision': 'continue'}, adjust, or abort

### Config

- `max_cycles` (integer, default: 3): Maximum oversight cycles

### Invariants

- The observer sees only the outcome, never the actor's reasoning or self-assessment
- The actor does not know an observer is watching
- The observer does not know an arbiter will act on its report
- The arbiter decides solely from the observer's report, not from the actor

### Shape

- `self`: manage the cycle, route information between roles, enforce separation
- `delegates`:
  - `actor`: execute the current plan
  - `observer`: independently analyze the outcome
  - `arbiter`: decide: continue, adjust, or abort
- `prohibited`: none

### Requires

- Pattern instance receives:
    actor: string         -- service or system name for the actor
    observer: string      -- service or system name for the observer
    arbiter: string       -- service or system name for the arbiter
    task_brief: string    -- the task to execute
    max_cycles: number    -- (optional, default 3)

### Returns

- Actor receives the task brief (first cycle) or adjusted brief (subsequent cycles)
- Observer receives ONLY the outcome — not the actor's reasoning or self-assessment
- Arbiter receives the observer's report and decides: continue, adjust, or abort
- If arbiter says adjust: the adjustment is passed to the actor's next cycle
- If arbiter says abort: return immediately with the reason
- If arbiter says continue: actor runs another cycle with the same brief
- `result`: the final outcome
- `cycles`: number of cycles run
- `abort_reason`: arbiter reason when the pattern aborts

### Delegation

```prose
let current_brief = task_brief
let last_outcome = null

repeat max_cycles as cycle:
  let last_outcome = call actor
    task_brief: current_brief

  let observation = call observer
    task_brief: task_brief
    outcome: last_outcome

  let decision = call arbiter
    task_brief: task_brief
    observer_report: observation

  if decision says abort:
    return {
      result: last_outcome,
      cycles: cycle,
      abort_reason: decision
    }

  if decision says adjust:
    current_brief = decision.adjusted_brief

return {
  result: last_outcome,
  cycles: max_cycles
}
```

### Notes

The actor does not know an observer is watching. The observer does not know an arbiter will act on its report. The information firewall between actor and observer is the structural guarantee — the observer's assessment cannot be contaminated by the actor's rationalization.
