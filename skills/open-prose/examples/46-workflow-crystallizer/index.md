---
name: workflow-crystallizer
kind: program
---

### Services

- `observer`
- `scoper`
- `author`
- `compiler`

### Requires

- `thread`: the conversation thread to analyze
- `hint`: what aspect to focus on (optional)

### Ensures

- `crystallized`: a validated .prose program extracted from the observed workflow pattern, written to the appropriate location

### Strategies

- when workflow overlaps with existing program: assess unique value before creating
- when compilation fails: fix and retry, max 3 attempts
