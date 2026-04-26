---
name: company-signal-brief-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `company-signal-brief` run payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over subject outputs and fixture expectations

### Expects

- brief names concrete business signals from the input notes
- brief connects the signals to OpenProse's durable workflow positioning
- brief ends with specific operator next actions

### Expects Not

- generic AI enthusiasm without buyer or workflow context
- claims about external facts not present in the inputs
- output that ignores the declared brand context

### Metrics

- specificity_score >= 0.75
- unsupported_claim_count = 0
- next_action_count >= 2
