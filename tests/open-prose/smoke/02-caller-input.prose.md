---
name: smoke-caller-input
kind: service
version: 0.15.0
---

### Description

Verifies caller-provided inputs are bound and visible to a service.

### Requires

- `topic`: a short phrase supplied by the smoke runner

### Ensures

- `echo`: one sentence that includes the provided topic and the exact phrase `caller-input-smoke-pass`
