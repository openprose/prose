---
name: validator
kind: service
shape:
  self: [validate syntax, check documentation completeness, verify installation]
  prohibited: [modifying files, running destructive commands]
---

### Requires

- task: what to validate

### Ensures

- validation: pass/fail with specific issues listed
