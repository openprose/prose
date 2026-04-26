---
name: examples-quality
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized run payload being evaluated
- `package_root`: string - optional package root to inspect alongside the subject run

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over subject run metadata and package quality signals
