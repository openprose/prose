---
name: tester
kind: service
---

### Requires

- `plan`: what was planned
- `implementation`: the code to test

### Ensures

- `tests`: runnable test plan or suite covering happy path, edge cases, and declared failure modes, with commands and expected outcomes
- `test-results`: pass/fail status with details on any failures
