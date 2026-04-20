---
name: implementer
kind: service
---

### Requires

- `task`: what to implement or fix

### Ensures

- `implementation`: clean, idiomatic code following existing project patterns

### Strategies

- implement exactly what is specified, nothing more
- when retrying after failure: use exponential backoff, max 2 retries
