---
name: quench
kind: service
---

### Shape

- `self`: write tests, find bugs, verify correctness
- `prohibited`: fixing bugs, implementing features

### Requires

- `task`: what to test
- `test-url`: URL to use for browser integration tests (optional; required only for end-to-end browser checks)

### Ensures

- `test-results`: pass/fail status with details on any failures
- tests cover: unit tests, integration tests, edge cases, and regression tests
