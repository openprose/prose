---
name: implementer
kind: service
---

requires:
- task: what to implement or fix

ensures:
- implementation: clean, idiomatic code following existing project patterns

strategies:
- implement exactly what is specified, nothing more
- when retrying after failure: use exponential backoff, max 2 retries
