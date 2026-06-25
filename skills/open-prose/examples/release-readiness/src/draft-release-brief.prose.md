---
name: draft-release-brief
kind: function
version: 0.15.0
---

# Draft Release Brief

### Description

Turns normalized evidence and risk assessment into a release-owner brief.

### Parameters

- `evidence-packet`: normalized release evidence with candidate version,
  validation results, docs and migration status, known risks, rollback notes,
  contradictions, and missing evidence
- `risk-assessment`: ship posture, blockers, non-blocking risks, missing
  evidence, confidence, and rationale
- `release-questions`: open questions that need an owner, source, or next
  review time before the recommendation can be trusted

### Returns

- `release-brief`: concise readiness brief with candidate version, ship or hold
  recommendation, evidence summary, blockers, risks, user-facing notes,
  rollback context, open questions, and next review timing
- `brief-followups`: owned follow-up actions needed before ship or after hold

### Invariants

- The recommendation is visible near the top of the brief.
- Source confidence and missing evidence remain explicit.

### Shape

- `self`: compose the readiness brief and follow-up list from supplied evidence
- `prohibited`: claiming deployment, suppressing blockers, or writing
  customer-facing release notes as final copy

### Strategies

- prefer `hold` over `ship` when blockers exist or rollback context is absent
- keep user-facing notes brief and tie them to change groups from the evidence
  packet
