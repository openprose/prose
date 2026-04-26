---
name: lead-program-designer-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `lead-program-designer` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over lead outputs and fixture expectations

### Expects

- normalized profile preserves buyer, pain, company, and provenance
- qualification score includes confidence and disqualifying risks
- Save/Grow plan changes when only `brand_context` changes

### Expects Not

- generic outreach copy that could fit any company
- qualification scores without evidence
- recompute of upstream profile or score when only brand context changes

### Metrics

- profile_field_coverage >= 0.9
- evidence_backed_score = true
- stale_drafter_only = true
