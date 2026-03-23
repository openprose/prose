---
name: evaluator
kind: service
---

requires:
- artifact: content to evaluate
- criteria: quality criteria

ensures:
- score: numeric score 0-100
- issues: specific issues identified with severity
