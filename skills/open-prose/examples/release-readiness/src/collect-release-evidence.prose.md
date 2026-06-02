---
name: collect-release-evidence
kind: function
---

# Collect Release Evidence

### Description

Normalizes the latest release event with candidate state and the prior readiness
truth.

### Parameters

- `release-events`: the latest release-readiness event, candidate snapshot, or
  manual review request, including candidate metadata, change summary, CI links,
  docs status, migration notes, and known risks
- `prior-readiness`: previous readiness briefs, decisions, and unresolved
  follow-up read from the responsibility's world-model

### Returns

- `evidence-packet`: normalized release evidence with candidate version,
  change groups, validation results, docs and migration status, known risks,
  rollback notes, source links, contradictions, and missing evidence
- `history-context`: relevant prior decisions, repeated risks, and unresolved
  follow-up from the prior readiness truth

### Shape

- `self`: normalize supplied release evidence and carry forward unresolved
  historical context
- `prohibited`: fetching private systems, hiding contradictory evidence, or
  deciding readiness alone

### Strategies

- when a pressure activation lacks a concrete event: use the latest candidate
  snapshot and unresolved history as the evidence packet
- when evidence conflicts: preserve both versions with source and timestamp
