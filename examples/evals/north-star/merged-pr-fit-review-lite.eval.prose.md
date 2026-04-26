---
name: merged-pr-fit-review-lite-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `merged-pr-fit-review-lite` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over PR review outputs and memory deltas

### Expects

- already-reviewed PRs are skipped
- findings cite files from the merged PR batch
- changed spirit anchors invalidate prior reviews
- summary distinguishes accepted decisions from follow-up questions

### Expects Not

- hallucinated file recommendations
- duplicate memory updates for reviewed PRs
- ungrounded criticism without PR evidence

### Metrics

- hallucinated_file_count = 0
- already_reviewed_skip_rate = 1
- memory_duplicate_count = 0
