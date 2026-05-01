---
name: guard
kind: pattern
---

# Guard

Check before delegating. Fail-fast pattern.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Slots

- `guard`
- `target`

### Config

- None. The guard and target are slot bindings; the task brief is a system input.

### Invariants

- The target runs only when the guard explicitly approves
- The target receives the original brief unchanged
- Unparseable guard output blocks delegation
- The guard's reason is returned when the pattern blocks

### Shape

- `self`: delegate to guard, if cleared delegate to target, otherwise return guard's reason
- `delegates`:
  - `guard`: evaluate whether the task should proceed
  - `target`: execute the task if guard approves
- `prohibited`: none

### Requires

- Pattern instance receives:
    guard: string          -- service or system name for the guard
    target: string         -- service or system name for the target
    task_brief: string     -- the task (goes to both guard and target)

### Ensures

- Guard receives the brief and returns structured JSON: { proceed: boolean, reason: string }
- If proceed: target receives the ORIGINAL brief unchanged
- If blocked: return immediately with the guard's reason — no delegation to target
- The guard does NOT modify the brief based on output — binary pass/block
- `result`: target output if proceeded, or guard reason if blocked
- `proceeded`: boolean

### Delegation

```prose
let decision = call guard
  task_brief: task_brief
  prompt: "Return { proceed: boolean, reason: string }. Block if the decision is ambiguous."

if decision does not explicitly proceed:
  return {
    result: decision.reason,
    proceeded: false
  }

let result = call target
  task_brief: task_brief

return {
  result: result,
  proceeded: true
}
```

### Notes

The guard does not know it gates access to another service. The target does not know a guard was consulted. The guard is a binary decision point — not a filter that modifies the brief. Useful when delegation is expensive and preconditions should be checked cheaply first.

The guard's contract promises structured JSON output (`{ proceed, reason }`). The delegation code parses that structure directly. If the guard returns unparseable output, the pattern fails safe by blocking — a guard that cannot clearly approve is a guard that has not approved.

Different from `refine`: a guard makes a one-shot binary decision before work begins. Refinement improves work that has already been done.
