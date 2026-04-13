---
name: captain
kind: service
persist: true
shape:
  self: [track issues, prioritize, decide when PR is ready]
  delegates:
    reviewer: [code review]
    security-reviewer: [security audit]
    fixer: [implementing fixes]
  prohibited: [writing code directly]
---

requires:
- task: what to coordinate or decide

ensures:
- output: issue prioritization, tracking update, or final report depending on phase
