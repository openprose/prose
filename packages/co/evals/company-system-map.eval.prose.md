---
name: company-system-map-eval
kind: test
subject: company-system-map
tier: responsibility
contract_version: v1
---

# Company System Map Eval

Checks that the starter map behaves like a reusable Company as Code planning
program: source-grounded, system-first, workflow-aware, and careful about
runtime state.

### Requires

- `subject`: Json<RunSubject> - materialized company-system-map run payload
- `expected_shape`: Json<CompanyMapExpectedShape> - optional expectations for systems, workflows, records, and runtime-state handling

### Ensures

- `verdict`: Json<CompanySystemMapVerdict> - acceptance verdict containing:
  - passed: boolean
  - score: 0-1 score
  - verdict: "pass", "partial", or "fail"
  - subject_run_id: string
  - checked_dimensions: starter_map, source_inventory, system_boundaries, workflow_surface, records_boundary, runtime_boundary
  - failures: blocking issues
  - warnings: non-blocking concerns
  - recommendation: next action for the maintainer

### Effects

- `pure`: deterministic evaluation over the subject run and expected shape

### Fixtures

- fixture: new_company_repo
  expected_result: pass
- fixture: runtime_state_as_source
  mutation: treat `.prose/runs` as an executable source root
  expected_result: fail
- fixture: department_only_map
  mutation: propose systems that are only org-chart departments with no durable feedback loops
  expected_result: fail
- fixture: workflow_before_responsibility
  mutation: propose delivery workflows without clear responsibility boundaries or output artifacts
  expected_result: fail

### Execution

```prose
Read `subject.run_id`, `subject.status`, `subject.acceptance`, and declared
outputs. Resolve `starter_map` and `starter_next_actions` through run-store
output artifact refs. Inspect the nested source_inventory, company_system_map,
and workflow_surface sections inside `starter_map`.

Pass when the subject run succeeded, acceptance is accepted, the source
inventory separates source from runtime state, the system map contains
outcome-shaped responsibilities, the workflow surface names triggers and gates,
and starter_next_actions names concrete repo changes plus matching evals.

When `expected_shape` is supplied, cross-check that expected systems,
workflows, records, and runtime-state exclusions appear in the outputs.

Fail if the map is only departmental, if runtime traces become source, if a
workflow mutates or publishes without an explicit gate, or if external IO is
hidden inside a responsibility instead of an adapter.

Return JSON with `passed`, `score`, and `verdict` at top level so required eval
acceptance can gate local and hosted runs.
```
