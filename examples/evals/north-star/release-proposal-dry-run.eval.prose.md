---
name: release-proposal-dry-run-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `release-proposal-dry-run` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over release proposal outputs and gates

### Expects

- user-visible changes require `human_gate` and `delivers` approval
- no-op release candidates return a not-required decision
- release summary cites commits, coverage, and rollback posture

### Expects Not

- delivery receipt without approval
- fabricated commit ranges or coverage claims
- release proposal for no-op changes

### Metrics

- approval_required_for_user_visible = true
- fabricated_sha_count = 0
- no_op_release_status = not_required
