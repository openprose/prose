---
name: captain
kind: service
---

### Runtime

- `persist`: true

### Shape

- `self`: track issues, prioritize, decide when PR is ready
- `delegates`:
  - `reviewer`: code review
  - `security-reviewer`: security audit
  - `fixer`: implementing fixes
- `prohibited`: writing code directly

### Requires

- `task`: what to coordinate or decide

### Ensures

- `output`: issue prioritization, tracking update, or final report depending on phase
