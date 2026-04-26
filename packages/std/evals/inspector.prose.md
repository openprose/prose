---
name: inspector
kind: test
---

# Run Inspector

Inspect a completed OpenProse run for runtime fidelity, task effectiveness,
artifact integrity, trace integrity, and acceptance readiness. This is the
standard library's foundational eval contract for run-store records.

### Requires

- `subject`: Json<RunSubject> - materialized run payload being inspected
- `depth`: string - "light" for structural checks or "deep" for artifact and trace review

### Ensures

- `inspection`: Json<RunInspection> - structured inspection containing:
  - passed: boolean
  - score: 0-1 normalized score for eval gates
  - verdict: "pass", "partial", or "fail"
  - subject_run_id: string
  - depth: "light" or "deep"
  - runtime_fidelity: score and evidence
  - task_effectiveness: score and evidence
  - artifact_integrity: score and evidence
  - trace_integrity: score and evidence
  - acceptance: summary of accepted, rejected, gated, or skipped state
  - flags: issue list with severity, evidence, and suggested owner
  - summary: concise human-readable explanation

### Effects

- `pure`: deterministic evaluation over declared run-store inputs

### Errors

- missing-run-record: the subject payload is not a valid run record projection
- missing-outputs: the subject declares success but has no output artifact references
- unsupported-depth: `depth` is not "light" or "deep"

### Invariants

- light inspections never claim content quality that was not observed
- deep inspections account for every output reference and every available trace or attempt record
- `passed`, `score`, and `verdict` are always top-level fields in the output JSON

### Execution

```prose
Treat `subject` as the canonical materialization. Inspect the run record fields:
run id, component ref, kind, status, caller, runtime profile, policy, inputs,
outputs, attempts, trace refs, eval records, and acceptance state. Use only
declared run-store records and artifact references.

For `depth: light`, check that the run completed, accepted required policy gates,
materialized every declared output, and has no blocking diagnostics or required
eval failures. Cap the score below perfect because light mode does not inspect
artifact content.

For `depth: deep`, inspect artifact metadata, schema validation status, trace
summaries, node attempt records, and output content snippets when available.
Compare these signals against the source or package contract embedded in the run
record or supplied alongside the subject. Separate runtime fidelity from task
effectiveness: a run may be faithfully executed but ineffective, or useful even
when an advisory trace warns about the process.
```
