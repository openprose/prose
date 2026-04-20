---
name: quench
kind: service
shape:
  self: [write tests, find bugs, verify correctness]
  prohibited: [fixing bugs, implementing features]
---

### Requires

- task: what to test

### Ensures

- test-results: pass/fail status with details on any failures
- tests cover: unit tests, integration tests, edge cases, and regression tests
