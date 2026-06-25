---
name: company-repo-checker.eval
kind: test
version: 0.15.0
subject: company-repo-checker
tier: function
contract_version: v1
---


# Company Repo Checker — System Test

Protects the reusable company-as-prose repository gate.

### Fixtures

- fixture: current_company_prose_repo
  repo_path: fixtures/company-prose/current
  expected_result: pass
- fixture: invalid_tier
  mutation: change any test frontmatter from a current tier
    (`tier: function` or `tier: responsibility`) to a retired
    `tier: delivery`
  expected_result: fail
- fixture: kind_mismatch
  mutation: give a `kind: function` contract `### Requires`/`### Maintains`
    instead of `### Parameters`/`### Returns`
  expected_result: fail
- fixture: unresolved_call_reference
  mutation: add a `call missing-capability` to any contract's `### Execution`
    with no resolving sub-unit
  expected_result: fail
- fixture: shared_depends_on_package_private
  mutation: make a `shared/` contract depend on a package-private contract
    that is not promoted to shared
  expected_result: fail

### Expects

- path: report.source_layout
  predicate: authored_source_under(source_roots)
- path: report.contract_surface
  predicate: every_data_flow_contract_has(["Requires","Maintains"])
- path: report.contract_surface
  predicate: every_callable_has(["Parameters","Returns"])
- path: report.test_pairing
  predicate: every_contract_has_test_subject
- path: report.test_metadata
  predicate: every_test_has(["subject","tier","contract_version","Expects","Expects Not","Performance Tracked Over Time"])
- path: report.dependency_graph
  predicate: all_contract_references_resolve_to_contract_or_explicit_external_reference
- path: report.counts
  predicate: includes(["contracts","tests","dependency_edges"])

### Expects Not

- path: failures[*]
  predicate: no_false_positive_from_h1_or_description_text_after("### Execution")
- path: failures[*]
  predicate: ignores_root("runs") during default scope
- path: failures[*]
  predicate: ignores_root("customers/*") during default scope
- path: execution
  predicate: no_repo_local_python_or_bash_script_required
- path: report.dependency_graph
  predicate: no_shared_contract_depends_on_package_private_source
- path: report.test_metadata
  predicate: no_retired_tier(["delivery","system"])

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
