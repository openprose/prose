---
name: perf-reviewer
kind: service
---

# Performance Reviewer

## Contract

requires:
- code: source code to review

ensures:
- perf-findings: performance findings prioritized by severity
