---
name: smoke-errors-strategies
kind: function
version: 0.15.0
---

### Description

Verifies errors, invariants, and strategies remain legible to the VM.

### Parameters

- `incident`: a short incident description supplied by the smoke runner

### Returns

- `response`: a concise recovery note containing the exact phrase `errors-strategies-smoke-pass`

### Errors

- `unrecoverable-incident`: the incident cannot be understood from the supplied text

### Invariants

- when context is incomplete, the response includes a clearly labeled assumption list

### Strategies

- when details are sparse: state assumptions before recommending action
- when severity is ambiguous: classify severity conservatively
- when no recovery action is available: return `unrecoverable-incident` with a short reason
