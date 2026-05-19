---
name: collect-release-evidence
kind: service
---

# Collect Release Evidence

### Description

Normalizes the latest release event with candidate state and prior decisions.

### Requires

- `activation_event`: the latest release-readiness event, pressure record, or
  manual review request
- `candidate_snapshot`: current candidate metadata, change summary, CI links,
  docs status, migration notes, and known risks
- `decision_history`: previous readiness briefs and release decisions, if any

### Ensures

- `evidence_packet`: normalized release evidence with candidate version,
  change groups, validation results, docs and migration status, known risks,
  rollback notes, source links, contradictions, and missing evidence
- `history_context`: relevant prior decisions, repeated risks, and unresolved
  follow-up from project state

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - release_decisions: prior release readiness records and follow-up actions
  - latest_release_event_at: newest processed release-readiness event timestamp
writes:
  - latest_release_event_at: advanced when newer evidence is accepted for review
```

### Shape

- `self`: normalize supplied release evidence and carry forward unresolved
  historical context
- `prohibited`: fetching private systems, hiding contradictory evidence, or
  deciding readiness alone

### Strategies

- when a pressure activation lacks a concrete event: use the latest candidate
  snapshot and unresolved history as the evidence packet
- when evidence conflicts: preserve both versions with source and timestamp
