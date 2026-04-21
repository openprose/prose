---
name: guard
kind: composite
---

# Guard

Check before delegating. Fail-fast pattern.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Runtime

- `state.reads`: &controlState
- `state.writes`: &controlState

### Slots

- `guard`
- `target`

### Shape

- `self`: delegate to guard, if cleared delegate to target, otherwise return guard's reason
- `delegates`:
  - `guard`: evaluate whether the task should proceed
  - `target`: execute the task if guard approves
- `prohibited`: none

### Requires

- &controlState exists at __controlState with:
    guard: string          -- component name for the guard
    target: string         -- component name for the target
    task_brief: string     -- the task (goes to both guard and target)

### Ensures

- Guard receives the brief and returns structured JSON: { proceed: boolean, reason: string }
- If proceed: target receives the ORIGINAL brief unchanged
- If blocked: return immediately with the guard's reason — no delegation to target
- The guard does NOT modify the brief based on output — binary pass/block
- &controlState.result contains the target's output (if proceeded) or guard's reason (if blocked)
- &controlState.proceeded is true/false

### Delegation

```javascript
const { guard, target, task_brief } = __controlState;

// Guard decides — expects structured JSON output { proceed, reason }
const guardBrief = `Evaluate whether this task should proceed.\n\nReturn your decision as JSON: { "proceed": true/false, "reason": "..." }\n\n${task_brief}`;
const guardResult = await rlm(guardBrief, null, { use: guard });

// Parse the guard's structured output
let decision;
try {
  const jsonMatch = String(guardResult).match(/\{[\s\S]*"proceed"[\s\S]*\}/);
  decision = JSON.parse(jsonMatch[0]);
} catch {
  // If the guard fails to return structured output, treat as blocked — fail safe
  decision = { proceed: false, reason: `Guard returned unparseable output: ${String(guardResult).slice(0, 200)}` };
}

if (!decision.proceed) {
  __controlState.result = decision.reason;
  __controlState.proceeded = false;
  return(decision.reason);
}

// Target executes
const result = await rlm(task_brief, null, { use: target });
__controlState.result = result;
__controlState.proceeded = true;
return(result);
```

### Notes

The guard does not know it controls access to another component. The target does not know a guard was consulted. The guard is a binary decision point — not a filter that modifies the brief. Useful when delegation is expensive and preconditions should be checked cheaply first.

The guard's contract promises structured JSON output (`{ proceed, reason }`). The delegation code parses that structure directly. If the guard returns unparseable output, the control fails safe by blocking — a guard that cannot clearly approve is a guard that has not approved.

Different from `refine`: a guard makes a one-shot binary decision before work begins. Refinement improves work that has already been done.
