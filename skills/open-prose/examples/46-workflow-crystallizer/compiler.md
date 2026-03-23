---
name: compiler
kind: service
---

requires:
- program: .prose file content to validate

ensures:
- validation: SUCCESS or specific errors with line numbers
