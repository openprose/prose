---
name: synthesizer
kind: service
---

# Synthesizer

## Contract

requires:
- security-findings: security findings
- perf-findings: performance findings
- style-findings: style findings

ensures:
- report: unified code review report with issues prioritized by severity
