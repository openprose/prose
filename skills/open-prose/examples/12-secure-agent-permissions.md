---
name: secure-permissions-demo
kind: program
---

### Services

- `code-reviewer`
- `doc-writer`

### Description

Demonstrates shapes as permission boundaries. Historical `permissions:`
declarations become `### Shape` sections that the VM enforces.

### Requires

- `codebase`: source code to review

### Ensures

- `review`: security review findings
- `documentation`: updated documentation based on review findings

## code-reviewer

### Shape

- `self`: read source files, analyze code patterns, identify vulnerabilities
- `prohibited`: modifying source files, running shell commands, writing to any directory

### Requires

- `codebase`: source code to review

### Ensures

- `review`: security issues and best practices findings with file paths cited

## doc-writer

### Shape

- `self`: read source files and docs, write documentation
- `prohibited`: modifying source code, running shell commands, writing outside docs/

### Requires

- `review`: code review findings

### Ensures

- `documentation`: updated documentation reflecting review findings
