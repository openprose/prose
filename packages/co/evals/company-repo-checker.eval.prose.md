---
name: company-repo-checker.eval
kind: test
subject: company-repo-checker
tier: responsibility
contract_version: v1
---


# Company Repo Checker — Responsibility Eval

Protects the reusable company-as-prose repository gate.

### Effects

- `pure`: fixture expectations and predicates are deterministic

### Fixtures

- fixture: current_openprose_company_repo
  repo_path: customers/prose-openprose
  expected_result: pass
- fixture: stale_workflow_tier
  mutation: change any workflow eval frontmatter from `tier: workflow` to
    `tier: delivery`
  expected_result: fail
- fixture: unresolved_service_reference
  mutation: add `missing-capability` to any `### Services` list
  expected_result: fail
- fixture: shared_depends_on_system_private
  mutation: make a `shared/` capability depend on a `systems/*/services/*`
    component that is not promoted to shared
  expected_result: fail

### Expects

- path: report.source_layout
  predicate: checks_legacy_roots(legacy_roots)
- path: report.contract_surface
  predicate: every_program_or_service_has(["Requires","Ensures"])
- path: report.eval_pairing
  predicate: every_program_or_service_has_eval_subject
- path: report.eval_metadata
  predicate: every_eval_has(["subject","tier","contract_version","Expects","Expects Not","Performance Tracked Over Time"])
- path: report.dependency_graph
  predicate: all_services_entries_resolve_to_component_or_explicit_external_reference
- path: report.counts
  predicate: includes(["executable_components","evals","dependency_edges"])

### Expects Not

- path: failures[*]
  predicate: no_false_positive_from_h1_or_description_text_after("### Services")
- path: failures[*]
  predicate: no_requirement_to_migrate(".prose/runs") during default scope
- path: failures[*]
  predicate: no_requirement_to_migrate("customers/*") during default scope
- path: execution
  predicate: no_repo_local_python_or_bash_script_required
- path: report.dependency_graph
  predicate: no_shared_component_depends_on_system_private_source
- path: report.eval_metadata
  predicate: no_tier("delivery")

### Performance Tracked Over Time

- metric: static_gate_runtime_seconds
  source: OpenProse run telemetry
  direction: down
  alert_when: p95 > 5s
- metric: false_positive_rate
  source: human triage of failed repo-checker runs
  direction: down
  alert_when: more than 1 false positive in a rolling 10 runs
- metric: architecture_regression_count
  source: failed checks grouped by failure kind
  direction: down
  alert_when: any regression reaches main
