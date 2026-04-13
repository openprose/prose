---
name: reviewer
kind: service
---

requires:
- pr: code changes to review

ensures:
- review: structured list of issues covering correctness, logic, style, and readability, each with file path and line number
