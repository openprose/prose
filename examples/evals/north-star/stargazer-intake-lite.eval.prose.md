---
name: stargazer-intake-lite-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `stargazer-intake-lite` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over stargazer outputs and memory deltas

### Expects

- duplicate stargazer rows collapse to one ranked record
- prior high-water rows are skipped
- memory delta advances only to accepted new rows
- digest excludes sensitive enrichment fields

### Expects Not

- duplicate follow-up entries for the same login
- high-water mark advancement after downstream failure
- public digest containing private enrichment notes

### Metrics

- duplicate_count = 0
- high_water_monotonic = true
- digest_private_field_count = 0
