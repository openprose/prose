---
name: reviewer
kind: service
---

### Requires

- `pr`: code changes to review

### Ensures

- `review`: structured list of issues covering correctness, logic, style, and readability, each with file path and line number
