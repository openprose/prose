---
name: smoke-errors-strategies
kind: service
version: 0.15.0
---

### Description

Verifies errors, conditional ensures, and strategies remain legible to the VM.

### Requires

- `incident`: a short incident description supplied by the smoke runner

### Ensures

- `response`: a concise recovery note containing the exact phrase `errors-strategies-smoke-pass`
- if context is incomplete: response includes a clearly labeled assumption list
- publish `response` as this service's declared output binding

### Errors

- `unrecoverable-incident`: the incident cannot be understood from the supplied text

### Strategies

- when details are sparse: state assumptions before recommending action
- when severity is ambiguous: classify severity conservatively
- when no recovery action is available: return `unrecoverable-incident` with a short reason
