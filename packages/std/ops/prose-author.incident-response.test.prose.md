---
name: test-prose-author-incident-response
kind: test
subject: prose-author
---

# Test Prose Author Incident Response

### Fixtures

- `request`: |
    incident response workflow

    input incident_id, severity, affected_service

    triage: gather current alerts, recent deploys, active incidents, owner
    rotation, and customer impact for affected_service

    if severity is sev1 or sev2:
      page incident commander and service owner
      create incident channel and status-page draft
    else:
      notify service owner in team channel

    loop until mitigated or max 4 cycles:
      investigator session: inspect telemetry and logs, propose likely cause and confidence
      mitigator session: propose lowest-risk mitigation, including rollback or feature flag options
      reviewer session: approve mitigation only if blast radius and rollback plan are clear
      if reviewer approves: execute mitigation checklist and watch metrics for 10 minutes
      else: feed reviewer notes into next cycle

    after mitigation:
      publish customer/status update if external impact
      create postmortem issue with timeline, suspected cause, followups, and owners

    return incident_summary, mitigation_decision, postmortem_issue

### Expects

- `source_package`: prefers folder output because the workflow has branching,
  operational side effects, a bounded mitigation loop, and several specialist
  services
- `source_package`: maps `incident_id`, `severity`, and `affected_service`
  into `### Requires`
- `source_package`: preserves the return outputs `incident_summary`,
  `mitigation_decision`, and `postmortem_issue`
- `source_package`: includes explicit `if`/`else` ProseScript for the severity
  branch
- `source_package`: includes a bounded mitigation loop preserving max 4 cycles
- `source_package`: carries reviewer notes into the next mitigation cycle
- `source_package`: gates mitigation execution behind reviewer approval
- `authoring_notes`: records that operational side effects are represented as
  generated declarations and future runtime actions, not executed during
  authoring
- `source_package`: declares degraded outputs or errors for exhausted mitigation
  attempts
- `lint_report`: has status `pass` and no blocking findings

### Expects Not

- `authoring_notes`: claims PagerDuty, Slack, status pages, issue trackers,
  deployment systems, or feature flag systems were contacted during authoring
- `source_package`: executes mitigation before reviewer approval
- `source_package`: treats paging, channel creation, status updates, or issue
  creation as ordinary text with no side-effect boundary
- `source_package`: silently returns success when mitigation was not approved or
  not confirmed
