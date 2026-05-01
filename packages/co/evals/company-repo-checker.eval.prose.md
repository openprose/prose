---
name: company-repo-checker.eval
kind: test
subject: company-repo-checker
tier: system
contract_version: v1
---


# Company Repo Checker — System Test

Protects the reusable company-as-prose repository gate.

### Fixtures

- fixture: current_company_prose_repo
  repo_path: fixtures/company-prose/current
  expected_result: pass
- fixture: stale_legacy_tier
  mutation: change any system test frontmatter from `tier: system` to
    `tier: delivery`
  expected_result: fail
- fixture: unresolved_service_reference
  mutation: add `missing-capability` to any `### Services` list
  expected_result: fail
- fixture: shared_depends_on_system_private
  mutation: make a `shared/` capability depend on a `systems/*/services/*`
    service that is not promoted to shared
  expected_result: fail

### Expects

- path: report.source_layout
  predicate: checks_legacy_roots(legacy_roots)
- path: report.contract_surface
  predicate: every_service_or_system_has(["Requires","Ensures"])
- path: report.test_pairing
  predicate: every_service_or_system_has_test_subject
- path: report.test_metadata
  predicate: every_test_has(["subject","tier","contract_version","Expects","Expects Not","Performance Tracked Over Time"])
- path: report.dependency_graph
  predicate: all_services_entries_resolve_to_service_or_system_or_explicit_external_reference
- path: report.counts
  predicate: includes(["services","systems","tests","dependency_edges"])

### Expects Not

- path: failures[*]
  predicate: no_false_positive_from_h1_or_description_text_after("### Services")
- path: failures[*]
  predicate: no_requirement_to_migrate(".agents/prose/runs") during default scope
- path: failures[*]
  predicate: no_requirement_to_migrate("customers/*") during default scope
- path: execution
  predicate: no_repo_local_python_or_bash_script_required
- path: report.dependency_graph
  predicate: no_shared_service_depends_on_system_private_source
- path: report.test_metadata
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
