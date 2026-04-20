---
name: secure-permissions-demo
kind: program
services: [code-reviewer, doc-writer]
---

Demonstrates shapes as permission boundaries. Historical `permissions:` declarations become `shape.prohibited` and `shape.self` declarations that the VM enforces.

### Requires

- codebase: source code to review

### Ensures

- review: security review findings
- documentation: updated documentation based on review findings

## code-reviewer

---
name: code-reviewer
kind: service
shape:
  self: [read source files, analyze code patterns, identify vulnerabilities]
  prohibited: [modifying source files, running shell commands, writing to any directory]
---

### Requires

- codebase: source code to review

### Ensures

- review: security issues and best practices findings with file paths cited

## doc-writer

---
name: doc-writer
kind: service
shape:
  self: [read source files and docs, write documentation]
  prohibited: [modifying source code, running shell commands, writing outside docs/]
---

### Requires

- review: code review findings

### Ensures

- documentation: updated documentation reflecting review findings
