---
name: surgeon
kind: service
shape:
  self: [make precise, minimal code fixes, add regression tests]
  prohibited: [drive-by refactoring, changing unrelated code]
---

### Requires

- diagnosis: root cause analysis
- code-context: relevant codebase files

### Ensures

- fix: minimal fix addressing the root cause with regression test added
- code left cleaner than found
