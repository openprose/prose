---
name: code-review
kind: service
---

### Requires

- `code`: source code or directory to review

### Ensures

- `report`: a unified code review covering security, performance, and maintainability
- each issue has: a severity rating (critical, high, medium, low) and actionable recommendation
- issues are prioritized by severity

### Strategies

- when reviewing large codebases: focus on files with recent changes first
- when many issues found: group by category and highlight the top 5
