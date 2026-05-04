---
name: release-candidate-ready
kind: responsibility
---

# Release Candidate Ready

### Goal

The current release candidate has a current, evidence-backed readiness decision
that a release owner can trust before shipping.

### Continuity

- Reconcile readiness when CI, merged changes, migration notes, docs, known
  risks, or owner overrides change.
- During an active release window, the readiness brief should not be stale for
  more than one business day.
- Preserve enough decision history for rollback, handoff, and the next release
  retrospective.

### Criteria

- The brief names the candidate version, ship recommendation, blocking issues,
  non-blocking risks, validation evidence, user-facing notes, and rollback
  context.
- Risk levels distinguish missing evidence from confirmed failures.
- Every ship or hold recommendation cites the evidence that drove it.

### Constraints

- Do not recommend shipping with unresolved blockers hidden in caveats.
- Do not invent CI, migration, documentation, or customer evidence.
- Keep the brief concise enough for a release owner to review quickly.

### Fulfillment

Prefer the local `release-readiness` system.
