---
name: cross-run-differ
kind: test
---

# Cross-Run Differ

Compare two or more materialized OpenProse runs that represent related
executions: different inputs, providers, package versions, model policies, or
source revisions.

### Requires

- `subjects`: Json<RunSubject[]> - materialized run payloads to compare
- `comparison_goal`: string - optional reason for the comparison

### Ensures

- `comparison`: Json<RunComparison> - structured comparison containing:
  - passed: boolean
  - score: 0-1 confidence that the comparison supports a decision
  - verdict: "pass", "partial", or "fail"
  - comparable: boolean
  - runs: per-run metadata, status, provider, policy, acceptance, and artifact summary
  - output_diff: semantic differences across declared outputs
  - runtime_diff: timing, attempt, trace, and provider differences when available
  - cost_diff: token or metering differences when available
  - quality_diff: acceptance and eval-record differences
  - recommendation: preferred run or "inconclusive" with reasoning

### Effects

- `pure`: deterministic evaluation over declared run-store inputs

### Errors

- insufficient-runs: fewer than two subjects are provided
- incomparable-runs: subjects do not share a component ref, package family, or explicit comparison goal
- missing-output-artifacts: no subjects have comparable output artifacts

### Invariants

- every input run appears in the comparison even when it is incomplete
- missing cost, trace, or artifact data is reported as unavailable, not invented
- failed runs are compared as first-class evidence rather than dropped

### Execution

```prose
Build a comparison table from each subject's run id, component ref, status,
runtime provider, caller, policy, acceptance state, outputs, artifact refs, trace
refs, and eval records. Establish comparability from shared component refs,
shared package refs, related source hashes, or the explicit `comparison_goal`.

Compare outputs semantically first, then compare runtime behavior. Prefer schema
validation status, artifact metadata, eval records, and acceptance decisions over
surface text similarity. When provider, model, policy, or input changes explain a
difference, name that causal hypothesis separately from the observed diff.

Return a decision-grade JSON object. If the evidence is too sparse, set
`comparable` to false or `verdict` to "partial" and explain which additional run
store records would make the comparison useful.
```
