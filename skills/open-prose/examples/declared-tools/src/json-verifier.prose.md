---
name: json-verifier
kind: service
---

# JSON Verifier

### Description

Validates generated JSON before a downstream system consumes it.

### Requires

- `candidate_json`: JSON text to validate

### Ensures

- `validation_report`: whether the JSON is valid, with parse errors and line
  references when validation fails

### Tools

- `cli:jq`: JSON CLI available on PATH for syntax validation

### Strategies

- when JSON validation fails, report the parse error and location without
  rewriting the input
