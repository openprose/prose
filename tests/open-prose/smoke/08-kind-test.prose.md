---
name: smoke-kind-test
kind: test
version: 0.15.0
subject: smoke-caller-input
---

### Description

Verifies `kind: test` fixtures bind inputs, run a function subject, and produce
`---test PASS`.

### Fixtures

- `topic`: "kind test smoke fixture"

### Expects

- `echo`: contains `kind test smoke fixture`
- `echo`: contains the exact phrase `caller-input-smoke-pass`

### Expects Not

- `__error.md` exists
