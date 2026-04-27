---
name: company-repo-checker-eval
kind: test
subject: company-repo-checker
tier: responsibility
contract_version: v2
---

# Company Repo Checker Eval

Protects the reusable company-as-code repository gate. The eval consumes the
materialized checker run, and optionally a compact repository snapshot, then
returns a machine-readable verdict.

### Requires

- `subject`: Json<RunSubject> - materialized company-repo-checker run payload
- `repo_snapshot`: Json<CompanyRepoSnapshot> - optional source layout and eval pairing snapshot used as extra evidence

### Ensures

- `verdict`: Json<CompanyRepoCheckerVerdict> - acceptance verdict containing:
  - passed: boolean
  - score: 0-1 readiness score
  - verdict: "pass", "partial", or "fail"
  - subject_run_id: string
  - checked_dimensions: source_layout, contract_surface, eval_pairing, eval_metadata, dependency_graph
  - failures: file-grounded failures that should block promotion
  - warnings: non-blocking follow-up findings
  - recommendation: next action for the maintainer or hosted registry

### Effects

- `pure`: deterministic evaluation over run-store and snapshot inputs

### Fixtures

- fixture: modern_company_repo
  expected_result: pass
- fixture: stale_workflow_tier
  mutation: change any workflow eval frontmatter from `tier: workflow` to an obsolete tier
  expected_result: fail
- fixture: unresolved_service_reference
  mutation: add `missing-capability` to any `### Services` list
  expected_result: fail
- fixture: shared_depends_on_system_private
  mutation: make a `shared/` capability depend on a `systems/*/services/*` component
  expected_result: fail

### Execution

```prose
Read `subject.run_id`, `subject.component_ref`, `subject.status`,
`subject.acceptance`, `subject.outputs`, `subject.policy`, and attached eval
records. Resolve checker outputs only through run-store output artifact refs.

Pass when the subject run succeeded, acceptance is accepted, `report` is valid
JSON, `passed` is true, and `failures` is an empty JSON array. When
`repo_snapshot` is supplied, cross-check that the report names the expected
source roots, executable components, eval subjects, and dependency edges.

Fail on unresolved service references, missing paired evals, stale executable
metadata, source files under retired roots, or cross-system private
dependencies. Do not fail on committed `.prose/runs/` artifacts or nested
customer packages unless the snapshot explicitly includes them in scope.

Return JSON with `passed`, `score`, and `verdict` at top level so required eval
acceptance can gate local and hosted runs.
```
