---
name: vuln-discovery.happy.eval
kind: test
subject: vuln-discovery
tier: system
contract_version: v1
---

# Vulnerability Discovery — Happy Path

Protects the core promise: against a small repo with a known, reproducible
vulnerability, the system ships a schema-conformant report whose finding is
independently re-reproduced, root-caused, traced, and severity-rated.

### Fixtures

- `repo_path`: fixtures/target/known-vulnerable
- `attack_surface`: "input deserialization on the public request handler"
- `round_budget`: 2

### Expects

- path: report
  predicate: schema_conformant
- path: report.findings[*]
  predicate: every_finding_has(["root_cause","poc_or_no_repro_note","reproduction_verdict","reachability","severity","dedupe_group"])
- path: report.findings[*]
  predicate: at_least_one_finding_with(reproduction_verdict == "confirmed")
- path: report.coverage
  predicate: lists_explored_and_deferred_each_with_reason
- path: certified_surface
  predicate: monotonic_nondecreasing_across_rounds

### Expects Not

- path: report.findings[*]
  predicate: no_finding_shipped_as_reproduced_without_a_compiled_executed_poc
- path: disprove
  predicate: never_reads_hunt_agent_workspace_or_reasoning
- path: disprove
  predicate: introduces_no_finding_absent_from_its_input
- path: report.coverage
  predicate: no_refused_task_silently_dropped

### Performance Tracked Over Time

- metric: rounds_to_first_confirmed_finding
  source: OpenProse run telemetry
  direction: down
  alert_when: p95 > round_budget
- metric: disprove_false_confirm_rate
  source: human triage of confirmed findings
  direction: down
  alert_when: more than 1 false confirm in a rolling 10 runs
- metric: certified_surface_regressions
  source: ledger diffs across consecutive runs
  direction: down
  alert_when: any run shrinks certified_surface
