---
name: captains-chair
kind: program
---

### Services

- `captain`
- `researcher`
- `coder`
- `critic`
- `tester`

### Requires

- `task`: the feature or task to implement
- `codebase-context`: brief description of the codebase and relevant files

### Ensures

- `result`: completed, reviewed, and tested implementation with summary of changes

### Execution

```prose
# Phase 1: Strategic planning
let plan = call captain
  task: task
  codebase-context: codebase-context

# Phase 2: Parallel research sweep
let docs = call researcher
  topic: task
  focus: "documentation and README files"

let code-patterns = call researcher
  topic: task
  focus: "existing code patterns and implementations"

let existing-tests = call researcher
  topic: task
  focus: "existing tests covering similar functionality"

# Phase 3: Plan synthesis with critic review
let implementation-plan = call captain
  task: "synthesize research into implementation plan"
  plan: plan
  docs: docs
  code-patterns: code-patterns
  existing-tests: existing-tests

let plan-review = call critic
  artifact: implementation-plan
  focus: "architectural concerns, missing edge cases, testability"

if plan-review has critical concerns:
  let implementation-plan = call captain
    task: "revise plan based on critic feedback"
    plan: implementation-plan
    review: plan-review

# Phase 4: Implementation with review
let implementation = call coder
  plan: implementation-plan

let code-review = call critic
  artifact: implementation
  focus: "security, correctness, style, performance"

if code-review has critical issues:
  let implementation = call coder
    plan: implementation-plan
    feedback: code-review

# Phase 5: Testing
let tests = call tester
  plan: implementation-plan
  implementation: implementation

# Phase 6: Final integration
let result = call captain
  task: "final review and summary"
  implementation: implementation
  tests: tests
  code-review: code-review

return result
```
