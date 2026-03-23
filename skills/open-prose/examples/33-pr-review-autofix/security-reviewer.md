---
name: security-reviewer
kind: service
---

requires:
- pr: code changes to audit

ensures:
- security-review: HIGH priority findings covering injection, auth, data exposure, and crypto weaknesses
