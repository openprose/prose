---
name: style-reviewer
kind: service
---

# Style Reviewer

## Contract

requires:
- code: source code to review

ensures:
- style-findings: style findings prioritized by severity
