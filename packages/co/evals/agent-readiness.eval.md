---
name: agent-readiness.eval
kind: test
subject: agent-readiness
tier: workflow
contract_version: v1
---


# Agent Readiness — Workflow Eval

Protects the demo-facing entry point for new users: every run must produce a
grounded, short, actionable report the caller can screenshot.

### Fixtures

- fixture: agent_friendly_domain
  company_name: OpenProse
  domain: prose.md
  focus: all
  expected_result: overall_score >= 60 and report_path exists
- fixture: js_wall_marketing_site
  company_name: FictionalJsApp
  domain: a known JS-rendered marketing page with no `/llms.txt`
  focus: marketing-site
  expected_result: parseability score <= 40 and exactly one top_fix names
    a plain-HTML fallback
- fixture: missing_well_knowns
  company_name: Bare
  domain: a domain returning 404 on `/llms.txt`, `/sitemap.xml`,
    `/.well-known/ai-plugin.json`
  focus: all
  expected_result: discoverability score <= 30 and top_fixes[0] names
    `/llms.txt`
- fixture: unreachable_domain
  company_name: GhostCo
  domain: a domain that does not respond
  focus: all
  expected_result: errors contains `domain_unreachable` and no overall_score
    is produced

### Expects

- path: workspace_dir
  predicate: exists_on_disk and matches(^.*/prose-[a-z0-9-]+/$)
- path: report_path
  predicate: exists_on_disk and ends_with("agent-readiness.md")
- path: overall_score
  predicate: is_integer_between(0, 100)
- path: dimension_scores
  predicate: every_value_is_integer_between(0, 100)
- path: top_fixes
  predicate: length == 3 and every_item_names_a_file_path_or_url
- path: report
  predicate: contains_section("Raw Probe Results") and
    every_finding_grounds_in_raw_probe_results

### Expects Not

- path: report
  predicate: no_recommendation_without_file_path
- path: report
  predicate: no_ungrounded_score (every score has at least one evidence bullet)
- path: execution
  predicate: no_javascript_execution_attempted
- path: execution
  predicate: no_fetch_outside_target_origin (probes stay on the user's domain)
- path: workspace_dir
  predicate: no_write_outside_workspace_dir

### Performance Tracked Over Time

- metric: wall_clock_seconds
  source: OpenProse run telemetry
  direction: down
  alert_when: p95 > 60s
- metric: ungrounded_finding_rate
  source: human triage of demo runs
  direction: down
  alert_when: more than 1 ungrounded finding in a rolling 10 runs
- metric: caller_screenshot_rate
  source: demo feedback ("did you share the report?")
  direction: up
  alert_when: share rate drops below 50% in a rolling 10 demos
