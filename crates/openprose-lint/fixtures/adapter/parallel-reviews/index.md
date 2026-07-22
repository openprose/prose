---
name: parallel-reviews
kind: program
services: [security-reviewer, perf-reviewer, style-reviewer, synthesizer]
---

# Parallel Reviews

Run three independent reviews over caller-provided code, then synthesize a
single prioritized report.

## Contract

requires:
- code: source code to review

ensures:
- report: unified code review report with issues prioritized by severity

### Execution

let security = call security-reviewer
  code: code

let performance = call perf-reviewer
  code: code

let style = call style-reviewer
  code: code

return call synthesizer
  security_findings: security
  perf_findings: performance
  style_findings: style
