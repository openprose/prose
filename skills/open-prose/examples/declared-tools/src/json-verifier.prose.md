---
name: json-verifier
kind: function
version: 0.15.0
---

# JSON Verifier

### Description

Validates generated JSON before a downstream consumer uses it.

### Parameters

- `candidate-json`: JSON text to validate

### Returns

- `validation-report`: whether the JSON is valid, with parse errors and line
  references when validation fails

### Tools

- `cli:jq`: JSON CLI available on PATH for syntax validation

### Strategies

- when JSON validation fails, report the parse error and location without
  rewriting the input
