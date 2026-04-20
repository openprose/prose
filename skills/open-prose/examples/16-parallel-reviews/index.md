---
name: parallel-reviews
kind: program
services: [security-reviewer, perf-reviewer, style-reviewer, synthesizer]
---

### Requires

- code: the code to review

### Ensures

- report: a unified code review report covering security, performance, and style
