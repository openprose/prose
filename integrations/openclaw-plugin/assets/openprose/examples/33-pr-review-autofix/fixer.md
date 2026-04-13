---
name: fixer
kind: service
---

requires:
- issue: the specific issue to fix

ensures:
- fix-result: minimal fix addressing exactly the reported issue with verification

strategies:
- when fix fails: retry with different approach, max 2 attempts
- do NOT over-engineer -- fix exactly what is reported
