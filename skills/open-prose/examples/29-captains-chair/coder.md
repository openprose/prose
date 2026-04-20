---
name: coder
kind: service
---

### Requires

- `plan`: implementation plan to execute

### Ensures

- `implementation`: clean, idiomatic code following existing codebase patterns

### Strategies

- when plan is ambiguous: follow existing patterns in the codebase
- when feedback is provided: address specific issues without over-engineering
