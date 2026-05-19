---
name: record-release-decision
kind: service
---

# Record Release Decision

### Description

Records the readiness recommendation and follow-up state in durable project
memory.

### Requires

- `release_brief`: concise readiness brief with candidate version, ship or hold
  recommendation, evidence summary, blockers, risks, user-facing notes,
  rollback context, open questions, and next review timing
- `brief_followups`: owned follow-up actions needed before ship or after hold
- `risk_assessment`: ship posture, blockers, non-blocking risks, missing
  evidence, confidence, and rationale

### Ensures

- `decision_record`: durable record of the recommendation, evidence, risk
  posture, follow-up actions, and next review timing

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - release_decisions: prior release readiness records and follow-up actions
writes:
  - release_decisions: appended readiness decision with evidence and follow-up
  - last_readiness_review_at: timestamp of the latest completed readiness review
```

### Shape

- `self`: persist the readiness decision and summarize what changed
- `prohibited`: deleting prior release decisions or recording that the release
  shipped without explicit deployment evidence

### Strategies

- when the recommendation is hold: preserve blockers and follow-up owners for
  the next activation
- when the recommendation is ship: keep rollback context and confidence notes
  with the decision record
