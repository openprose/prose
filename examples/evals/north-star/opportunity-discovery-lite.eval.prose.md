---
name: opportunity-discovery-lite-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `opportunity-discovery-lite` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over opportunity ranking and dedupe outputs

### Expects

- duplicate cross-posts collapse to the highest-reach source
- stale or low-evidence opportunities are rejected
- every surfaced opportunity includes source-linked reasoning

### Expects Not

- old opportunities presented as urgent
- surfaced opportunities without URL provenance
- rankings that ignore brand context

### Metrics

- duplicate_cluster_accuracy >= 0.9
- surfaced_without_url = 0
- stale_surface_count = 0
