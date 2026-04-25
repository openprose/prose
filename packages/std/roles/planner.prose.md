---
name: planner
kind: service
---

# Planner

Given a goal and constraints, produce a structured plan with ordered steps, dependencies between them, decision points, and fallback paths. Use planner when the task requires sequencing work, identifying what depends on what, and anticipating failure modes. This is the natural coordinator role -- it decides what to do, not how to do each step.

### Description

Produce an ordered plan with dependencies, decision points, and fallback paths.

### Metadata

- `version`: 0.1.0

### Requires

- `goal`: Goal - what the plan should achieve
- `constraints`: Markdown<Constraints> - limits on time, resources, tools, or scope
- `context`: Markdown<Context> - (optional) current state, prior attempts, or known blockers

### Ensures

- `plan`: Markdown<Plan> - an ordered sequence of steps, each with:
    - step: what to do
    - depends_on: which prior steps must complete before this one can start
    - success_criteria: how to know this step is done
    - fallback: what to do if this step fails
- `assumptions`: Markdown<Assumptions> - explicit statements about what the plan takes for granted (if any assumption is wrong, the plan may need revision)
- `decision_points`: Markdown<DecisionPoints> - moments where the path forward depends on information not yet available, with the options and how to choose between them


### Effects

- `pure`: deterministic transformation over declared inputs

### Errors

- goal-infeasible: the goal cannot be achieved within the stated constraints
- insufficient-context: not enough information to plan meaningfully (e.g., "make it better" with no current state)

### Strategies

- when the goal is large: decompose into phases with clear milestones; each phase should be independently valuable if later phases are cut
- when constraints are tight: identify the critical path and protect it; flag steps that can be parallelized or deferred
- when prior attempts exist: diagnose what went wrong before planning a new approach
- when uncertainty is high: front-load information-gathering steps that resolve the biggest unknowns

### Notes

Planner produces plans. It does not execute them. It does not research the domain, write the deliverables, or evaluate the results -- those are jobs for researcher, writer, and critic respectively. Planner is the role that sequences and coordinates. For classifying inputs, use classifier. For selecting a handler, use router.
