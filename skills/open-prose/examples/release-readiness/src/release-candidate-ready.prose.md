---
name: release-candidate-ready
kind: responsibility
id: 067NC4KG0SYKXFT085146H258R
---

# Release Candidate Ready

### Goal

The current release candidate has a current, evidence-backed readiness decision
that a release owner can trust before shipping.

### Requires

- `release-events`: a current view of release-readiness evidence — candidate
  cuts, CI results, merged change summaries, migration notes, docs updates, risk
  reviews, manual approvals, and rollback notes

### Maintains

- `readiness`: the current readiness truth, with `decision` and `history` facets
- `decision` facet (material): candidate version, ship or hold recommendation,
  blocking issues, non-blocking risks, validation evidence, user-facing notes,
  rollback context, open questions, and next review timing
- `history` facet (material): prior readiness decisions, repeated risks, and
  unresolved follow-up, preserved across renders for rollback and retrospective
- immaterial: render scan timestamps and event delivery ids
- freshness: `valid_until` reflects the next review timing; during an active
  release window the brief should not be stale for more than one business day
- postcondition: risk levels distinguish missing evidence from confirmed failures
- postcondition: every ship or hold recommendation cites the evidence that drove it
- postcondition: a ship recommendation never hides unresolved blockers in caveats,
  and rollback context is present before any ship recommendation is final

### Continuity

- input-driven: reconcile readiness when CI, merged changes, migration notes,
  docs, known risks, or owner overrides change
- self-driven: re-check during an active release window so the brief does not go
  stale for more than one business day

### Invariants

- Do not invent CI, migration, documentation, or customer evidence.
- Never claim that a release was shipped.
- Keep the brief concise enough for a release owner to review quickly.

### Execution

```prose
let evidence = call collect-release-evidence
  release-events: release-events
  prior-readiness: readiness

let risk = call assess-release-risk
  evidence-packet: evidence.evidence-packet
  history-context: evidence.history-context

let drafted = call draft-release-brief
  evidence-packet: evidence.evidence-packet
  risk-assessment: risk.risk-assessment
  release-questions: risk.release-questions

return {
  decision: drafted.release-brief,
  history: drafted.brief-followups
}
```
