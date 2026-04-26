---
name: regression-tracker
kind: test
---

# Regression Tracker

Compare a new materialized run against a known-good baseline run or baseline
record. This eval is suitable for package CI, local graph acceptance, and hosted
runtime promotion gates.

### Requires

- `subject`: Json<RunSubject> - new materialized run being checked
- `baseline`: Json<RunBaseline> - optional baseline run payload or compact baseline record
- `program_name`: string - component, package, or product area being tracked
- `action`: string - "check", "set-baseline", or "list"

### Ensures

- `report`: Json<RegressionReport> - regression report containing:
  - passed: boolean
  - score: 0-1 quality or confidence score
  - verdict: "pass", "partial", or "fail"
  - action: requested action
  - program_name: tracked name
  - subject_run_id: string
  - baseline_run_id: string or null
  - status: "pass", "regressed", "improved", "registered", or "no-baseline"
  - dimensions: comparisons for contract, output quality, runtime, policy, acceptance, and eval records
  - evidence: specific run-store evidence behind the status
  - recommendation: next action for CI or a human reviewer

### Effects

- `pure`: deterministic evaluation over declared run-store inputs

### Errors

- missing-subject: subject run payload is absent or malformed
- unsupported-action: action is not one of the supported values
- incompatible-baseline: baseline exists but cannot be compared to the subject

### Invariants

- the eval never mutates persistent baseline state by itself
- a missing baseline returns a registration recommendation rather than inventing history
- every regression verdict cites the dimension and evidence that caused it

### Execution

```prose
For `action: check`, compare `subject` with `baseline` across run status,
acceptance, output artifacts, schema status, required eval records, policy
outcome, runtime provider, timing or attempt metadata, and trace summaries.
Prefer explicit baseline scores when present, but fall back to artifact and eval
evidence inside the baseline payload.

For `action: set-baseline`, validate that `subject` is accepted and has enough
artifact and eval evidence to become a baseline. Return a baseline record that a
caller can persist.

For `action: list`, summarize the supplied baseline payload if present and return
`no-baseline` otherwise. In every mode, return JSON with `passed`, `score`, and
`verdict` so eval acceptance and CI can consume the result directly.
```
