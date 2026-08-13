---
name: security-reviewer
kind: service
---

# Security Reviewer

## Contract

requires:
- code: source code to review

ensures:
- security-findings: security findings prioritized by severity
