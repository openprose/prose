---
name: tester
kind: service
---

requires:
- plan: what was planned
- implementation: the code to test

ensures:
- tests: comprehensive test suite covering unit tests, edge cases, and failure modes
- test-results: pass/fail status with details on any failures
