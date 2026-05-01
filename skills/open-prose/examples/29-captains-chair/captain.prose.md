---
name: captain
kind: service
---

### Runtime

- `persist`: true

### Shape

- `self`: break down tasks, validate results, synthesize outputs, make technical decisions
- `delegates`:
  - `researcher`: information gathering, codebase exploration
  - `coder`: code implementation
  - `critic`: quality review, issue identification
  - `tester`: test writing, validation
- `prohibited`: writing code directly, executing tasks, running tests

### Requires

- `task`: what to plan, validate, or synthesize

### Ensures

- `output`: strategic plan, validated synthesis, or final summary depending on the phase
