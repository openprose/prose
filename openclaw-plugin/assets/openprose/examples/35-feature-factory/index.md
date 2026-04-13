---
name: feature-factory
kind: program
services: [captain, architect, implementer, tester, documenter]
---

requires:
- feature: description of the feature to implement
- codebase-context: brief description of the codebase (optional)

ensures:
- summary: completed feature with implementation, tests, and documentation

### Execution

# Phase 1: Understand the codebase
let codebase-analysis = call captain
  task: "analyze codebase structure, patterns, and where this feature fits"
  feature: feature
  codebase-context: codebase-context

# Phase 2: Design
let design = call architect
  feature: feature
  codebase-analysis: codebase-analysis

let design-review = call captain
  task: "review design for architectural fit and simplicity"
  design: design

if design needs adjustment:
  let design = call architect
    feature: feature
    codebase-analysis: codebase-analysis
    feedback: design-review

# Phase 3: Implementation
let tasks = call captain
  task: "break design into ordered implementation tasks"
  design: design

loop for each task in tasks (max: 10):
  let implementation = call implementer
    task: task
    design: design
    codebase-analysis: codebase-analysis

  let review = call captain
    task: "review implementation against design"
    implementation: implementation

  if implementation needs fixes:
    call implementer
      task: "fix issues noted in review"
      implementation: implementation
      feedback: review

# Phase 4: Testing
let tests = call tester
  design: design
  codebase-analysis: codebase-analysis

loop until all tests pass (max: 5):
  call implementer
    task: "fix failing tests"
    test-results: tests
  let tests = call tester
    task: "re-run tests"

# Phase 5: Documentation
let api-docs = call documenter
  design: design
  focus: "API documentation and usage examples"

let readme-update = call documenter
  design: design
  codebase-analysis: codebase-analysis
  focus: "README updates"

# Phase 6: Final summary
let summary = call captain
  task: "final review and feature summary"
  design: design
  tests: tests
  api-docs: api-docs

return summary
