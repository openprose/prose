---
name: parallel-reviews
kind: program
services: [security-reviewer, perf-reviewer, style-reviewer, synthesizer]
---

requires:
- code: the code to review

ensures:
- report: a unified code review report covering security, performance, and style
