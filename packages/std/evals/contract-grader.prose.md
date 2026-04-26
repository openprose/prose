---
name: contract-grader
kind: test
---

# Contract Grader

Grade whether a completed OpenProse run satisfied the contract it claimed to
run. This eval is intentionally run-store native: it consumes the materialized
run payload, output artifact references, trace summaries, acceptance state, and
any attached eval records.

### Requires

- `subject`: Json<RunSubject> - materialized run payload being graded
- `contract`: Json<ContractSnapshot> - optional source IR or package IR contract snapshot for the subject component

### Ensures

- `grade`: Json<ContractGrade> - pass/fail grade containing:
  - passed: boolean
  - score: 0-1 contract satisfaction score
  - verdict: "pass", "partial", or "fail"
  - subject_run_id: string
  - component_ref: string
  - clauses: list of graded contract clauses with verdict, evidence, and confidence
  - unevaluable: list of clauses that need sharper source contracts before they can be graded
  - recommendations: concrete source changes that would make future grading more reliable

### Effects

- `pure`: deterministic evaluation over declared run-store inputs

### Errors

- missing-run-record: `subject.run_id`, `subject.status`, or `subject.outputs` is missing
- missing-contract: no contract snapshot or source-derived ensures are available
- missing-output-artifacts: the run declares successful execution but has no output artifact references

### Invariants

- every available ensures clause is either graded or listed as unevaluable
- a failed subject run cannot receive a passing verdict unless the contract explicitly defines a degraded success path
- score is normalized from 0 to 1 and can be read directly by eval acceptance gates

### Execution

```prose
Read `subject.run_id`, `subject.component_ref`, `subject.status`,
`subject.outputs`, `subject.acceptance`, `subject.policy`, and any eval records
attached to the run. Resolve the subject's output and artifact references only
through the provided run-store payload; do not assume a filesystem layout.

Extract the relevant requires and ensures clauses from `contract` when present.
When `contract` is absent, infer only the narrow checks supported by the
materialized run record: success status, accepted acceptance state, non-empty
declared outputs, schema validation status, policy outcome, and prior eval
status. Mark every inferred or unavailable clause with lower confidence.

Grade clauses strictly. Format, count, schema, and policy commitments require
specific evidence from output artifact metadata, trace summaries, or acceptance
records. Subjective quality commitments may pass only when the output artifact
content or prior eval evidence supports them. Return JSON with `passed`, `score`,
and `verdict` at top level so runtime eval acceptance can consume it directly.
```
