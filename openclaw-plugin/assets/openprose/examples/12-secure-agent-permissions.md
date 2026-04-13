---
name: secure-permissions-demo
kind: program
services: [code-reviewer, doc-writer]
---

Demonstrates v2 shapes as replacements for v1 agent permissions. In v2, `permissions:` become `shape.prohibited` and `shape.self` declarations that the VM enforces.

requires:
- codebase: source code to review

ensures:
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

requires:
- codebase: source code to review

ensures:
- review: security issues and best practices findings with file paths cited

## doc-writer

---
name: doc-writer
kind: service
shape:
  self: [read source files and docs, write documentation]
  prohibited: [modifying source code, running shell commands, writing outside docs/]
---

requires:
- review: code review findings

ensures:
- documentation: updated documentation reflecting review findings
