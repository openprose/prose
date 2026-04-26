---
name: eval-calibrator
kind: test
---

# Eval Calibrator

Measure whether fast evals agree with deeper evals across a sample of
OpenProse run records. This is the meta-eval for deciding which checks are safe
for CI, package publish gates, and reactive graph acceptance.

### Requires

- `subjects`: Json<RunSubject[]> - materialized runs with attached eval records
- `calibration_goal`: string - optional policy question the calibration should answer

### Ensures

- `report`: Json<EvalCalibrationReport> - calibration report containing:
  - passed: boolean
  - score: 0-1 calibration confidence
  - verdict: "pass", "partial", or "fail"
  - sample_size: number of subject runs analyzed
  - agreement_rate: rate at which fast and deep eval verdicts agree
  - score_correlation: computed correlation when enough paired scores exist
  - bias_direction: "optimistic", "pessimistic", "neutral", or "insufficient-data"
  - disagreements: ranked list of run ids where evals diverged
  - recommendations: changes to eval thresholds, required evals, or evidence capture

### Effects

- `pure`: deterministic evaluation over declared run-store inputs

### Errors

- insufficient-runs: fewer than three subjects are provided
- missing-eval-records: subjects do not contain enough paired eval evidence
- insufficient-pairs: fewer than three comparable fast/deep eval pairs are available

### Invariants

- arithmetic is computed from explicit numeric fields in eval records
- runs without paired eval records remain visible in the report as coverage gaps
- calibration never promotes a weak eval gate without naming the residual risk

### Execution

```prose
Read each subject's eval records, acceptance state, output refs, trace refs, and
status. Group eval records into fast and deep families using eval ref names,
metadata, run ids, or explicit policy labels. Treat missing pairs as a coverage
finding, not as agreement.

Compute agreement rate from exact verdict matches. Compute score deltas from
normalized numeric scores. Compute correlations only when the sample is large
enough to be meaningful; otherwise return `insufficient-data` and explain the
missing evidence.

Recommend which evals should become required gates, advisory checks, or deep
investigation tools. Tie every recommendation back to run-store evidence so the
runtime can use the report as backpressure for future package and graph runs.
```
