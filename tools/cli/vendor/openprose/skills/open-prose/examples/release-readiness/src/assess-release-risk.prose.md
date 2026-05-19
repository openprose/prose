---
name: assess-release-risk
kind: service
---

# Assess Release Risk

### Description

Classifies readiness evidence into blockers, non-blocking risks, and missing
validation.

### Requires

- `evidence_packet`: normalized release evidence with candidate version,
  validation results, docs and migration status, known risks, rollback notes,
  contradictions, and missing evidence
- `history_context`: relevant prior decisions, repeated risks, and unresolved
  follow-up from project state

### Ensures

- `risk_assessment`: ship posture, blockers, non-blocking risks, missing
  evidence, confidence, and rationale
- `release_questions`: open questions that need an owner, source, or next
  review time before the recommendation can be trusted

### Invariants

- A confirmed blocker prevents a ship recommendation.
- Missing rollback context lowers confidence even when validation is green.

### Shape

- `self`: evaluate supplied evidence and separate blocking risk from ordinary
  release uncertainty
- `prohibited`: inventing test results, downgrading blockers without evidence,
  or approving a release

### Strategies

- when all validation is green but docs or migration notes are missing: mark
  the posture as conditional rather than ready
- when a repeated risk appears in history: raise confidence only if new
  mitigation evidence is present
