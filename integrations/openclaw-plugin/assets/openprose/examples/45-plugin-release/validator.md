---
name: validator
kind: service
shape:
  self: [validate syntax, check documentation completeness, verify installation]
  prohibited: [modifying files, running destructive commands]
---

requires:
- task: what to validate

ensures:
- validation: pass/fail with specific issues listed
