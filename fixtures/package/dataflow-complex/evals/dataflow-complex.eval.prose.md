---
name: dataflow-complex-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized dataflow-complex run payload

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over graph dataflow outputs and provenance

### Expects

- graph produces final_brief, scorecard, and risk_digest outputs
- scorecard can be recomputed without final assembly when targeted
- private account labels remain attached to derived artifacts

### Expects Not

- final assembly running for scorecard-only recompute
- graph outputs without producer node provenance
- private account context leaking into public unlabeled outputs
