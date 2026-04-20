---
name: architect-by-simulation
kind: program
---

### Services

- `architect`
- `phase-executor`
- `reviewer`

### Requires

- `feature`: the feature or system to architect
- `context-files`: comma-separated list of files to read for context
- `output-dir`: directory for the BUILD_PLAN and phase handoffs

### Ensures

- `spec`: complete, implementable specification document
- `handoffs`: phase-by-phase design exploration documents
- `review`: independent validation of the design

### Execution

```prose
# Phase 1: Gather context
let context = call phase-executor
  task: "read and summarize context files for integration points"
  context-files: context-files

# Phase 2: Create master plan
let master-plan = call architect
  task: "create BUILD_PLAN with design phases"
  feature: feature
  context: context
  output-dir: output-dir

# Phase 3: Execute phases serially with handoffs
let accumulated-handoffs = ""

loop for each phase in master-plan.phases (max: 10):
  let handoff = call phase-executor
    task: phase.name
    phase-number: phase.index
    build-plan: master-plan
    previous-handoffs: accumulated-handoffs
    output-dir: output-dir

  call architect
    task: "synthesize learnings from phase"
    handoff: handoff

  let accumulated-handoffs = accumulated-handoffs + handoff

# Phase 4: Review
let review = call reviewer
  handoffs: accumulated-handoffs

if review has critical issues:
  let revisions = call architect
    task: "address critical review issues"
    handoffs: accumulated-handoffs
    review: review
  let accumulated-handoffs = accumulated-handoffs + revisions

# Phase 5: Final spec
let spec = call architect
  task: "synthesize all handoffs into final specification"
  handoffs: accumulated-handoffs
  output-path: output-dir + "/SPEC.md"

return {
  spec: spec
  handoffs: accumulated-handoffs
  review: review
}
```
