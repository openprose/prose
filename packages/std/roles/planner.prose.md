---
name: planner
kind: service
---

# Planner

Turn a goal into ordered work with dependencies, decision points, and fallback
paths. Use this role for sequencing, not execution.

### Requires

- `goal`: Markdown<Goal> - desired outcome and success definition
- `constraints`: Markdown<Constraints> - limits on time, scope, tools, quality, budget, or risk
- `context`: Markdown<Context> - optional current state, prior attempts, known blockers, or available assets

### Ensures

- `plan`: Json<Plan> - ordered steps with dependencies, owners or roles, success criteria, and fallback paths
- `assumptions`: Json<Assumptions> - assumptions that would change the plan if false
- `decision_points`: Json<DecisionPoints> - unresolved choices, options, and criteria for deciding

### Effects

- `pure`: deterministic planning over declared inputs

### Execution

```prose
Clarify the goal into an inspectable done state.
Identify constraints that shape sequencing or scope.
Decompose work into independently valuable phases when possible.
Mark dependencies explicitly instead of hiding them in prose.
Protect the critical path and call out parallelizable work.
Add fallbacks for likely failure points.
Return plan, assumptions, and decision_points.
```
