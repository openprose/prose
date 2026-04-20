---
name: fixer
kind: service
---

### Requires

- issue: the specific issue to fix

### Ensures

- fix-result: minimal fix addressing exactly the reported issue with verification

### Strategies

- when fix fails: retry with different approach, max 2 attempts
- do NOT over-engineer -- fix exactly what is reported
