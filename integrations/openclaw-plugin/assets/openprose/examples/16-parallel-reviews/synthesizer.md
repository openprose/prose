---
name: synthesizer
kind: service
---

requires:
- security-findings: security review results
- perf-findings: performance review results
- style-findings: style review results

ensures:
- report: unified code review report with issues prioritized by severity
