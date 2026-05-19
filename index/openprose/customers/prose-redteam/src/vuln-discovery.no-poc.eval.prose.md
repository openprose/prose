---
name: vuln-discovery.no-poc.eval
kind: test
subject: vuln-discovery
tier: system
contract_version: v1
---

# Vulnerability Discovery — No PoC, No Shipped Reproduction

Protects the firewall: when a hunter asserts a finding but cannot produce a
compiled, executed PoC, the system must not ship it as reproduced. It may only
appear with an explicit reasoned no-repro note, and disprove must never upgrade
it to confirmed.

### Fixtures

- `repo_path`: fixtures/target/plausible-but-unreproducible
- `attack_surface`: "an asserted auth bypass that does not actually reproduce"
- `round_budget`: 2

### Expects

- path: report
  predicate: schema_conformant
- path: report.findings[*]
  predicate: any_unreproduced_finding_carries_an_explicit_reasoned_no_repro_note
- path: report.findings[*]
  predicate: unreproduced_findings_have_reproduction_verdict_in(["refuted","unreproducible"])

### Expects Not

- path: report.findings[*]
  predicate: no_finding_with_no_repro_note_presented_as_reproduced
- path: disprove
  predicate: never_returns_confirmed_for_a_no_repro_note
- path: schema-validator
  predicate: never_accepts_a_report_shipping_a_finding_without_reproduction_or_a_reasoned_no_repro_note
- path: report
  predicate: not_empty_when_a_legitimate_task_was_attempted

### Performance Tracked Over Time

- metric: false_confirm_escapes
  source: human triage of shipped reproduced findings
  direction: down
  alert_when: any shipped finding marked reproduced lacks a compiled+executed PoC
- metric: no_repro_note_completeness
  source: human triage of no-repro findings
  direction: up
  alert_when: any no-repro finding lacks a stated reason
