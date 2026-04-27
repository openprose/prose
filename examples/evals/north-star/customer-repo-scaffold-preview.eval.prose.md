---
name: customer-repo-scaffold-preview-eval
kind: test
---

### Requires

- `subject`: Json<RunSubject> - materialized `customer-repo-scaffold-preview` graph payload
- `fixture_root`: string - path to the north-star fixture corpus

### Ensures

- `verdict`: Json<EvalVerdict> - pass/fail verdict, score, and concise reason

### Effects

- `pure`: deterministic evaluation over scaffold preview artifacts

### Expects

- preview includes responsibilities, services, workflows, and evals paths
- scratch mutation stays inside the authorized workspace
- existing customer slugs are refused rather than overwritten

### Expects Not

- retired `delivery/` scaffold paths
- writes outside the scratch workspace
- untracked file mutations not represented in the preview

### Metrics

- required_directory_coverage = 1
- unauthorized_write_count = 0
- retired_path_count = 0
