---
name: critic
kind: service
---

### Requires

- artifact: code or plan to review
- focus: what aspects to prioritize

### Ensures

- review: issues found prioritized by severity (critical, high, medium, low)
- each issue: has specific location, description, and suggested fix

### Strategies

- be constructive but thorough
- prioritize security and correctness over style
