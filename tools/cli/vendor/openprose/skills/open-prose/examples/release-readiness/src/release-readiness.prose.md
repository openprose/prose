---
name: release-readiness
kind: system
---

# Release Readiness

### Description

Builds a release decision brief from candidate metadata, validation evidence,
known risks, user-facing notes, and rollback context.

### Services

- `collect-release-evidence`
- `assess-release-risk`
- `draft-release-brief`
- `record-release-decision`

### Requires

- `activation_event`: the latest release-readiness event, pressure record, or
  manual review request
- `candidate_snapshot`: current candidate metadata, change summary, CI links,
  docs status, migration notes, and known risks
- `decision_history`: previous readiness briefs and release decisions, if any

### Ensures

- `release_brief`: a concise readiness brief with ship or hold recommendation,
  evidence, risks, notes, and rollback context
- `decision_record`: durable record of the recommendation, evidence, risk
  posture, and next review timing

### Invariants

- Missing evidence is labeled separately from confirmed failure.
- Rollback context appears before any ship recommendation is final.
- The system never claims that a release was shipped.

### Runtime

- `persist`: project
