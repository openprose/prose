---
name: smoke-kind-test
kind: test
subject: 02-caller-input
---

### Description

Verifies `kind: test` fixtures bind inputs and produce `---test PASS`.

### Fixtures

- `topic`: "kind test smoke fixture"

### Expects

- `echo`: contains `kind test smoke fixture`
- `echo`: contains the exact phrase `caller-input-smoke-pass`

### Expects Not

- `__error.md` exists
