---
name: agent-ecosystem-index-refresh-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `agent-ecosystem-index-refresh` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over index artifacts and runtime measurements

### Expects

- every platform row includes a URL
- security posture cites evidence before being marked clear
- node-level measurements separate graph VM from model provider and model

### Expects Not

- uncited security posture
- missing platform status rows
- treating OpenRouter or other model providers as graph VMs

### Metrics

- platform_url_coverage = 1
- uncited_security_clear_count = 0
- node_model_measurement_coverage >= 0.9
