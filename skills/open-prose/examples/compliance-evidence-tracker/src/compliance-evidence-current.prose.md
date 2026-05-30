---
name: compliance-evidence-current
kind: responsibility
id: 067NC4KG0HWJNASC5MQ2YC1H68
---

# Compliance Evidence Current

### Goal

Compliance evidence for active controls is current, reviewable, and ready for
an auditor or internal owner before review windows become urgent.

### Requires

- `evidence-signals`: a current view of evidence-change events, control changes,
  failed checks, policy exceptions, and incoming audit requests for active
  controls

### Maintains

- `controls`: per-control evidence truth. Its subscribable parts are the three
  `####` facets below — each `####` part *is* a facet (fingerprint unit +
  `Requires.<facet>` ↔ `Maintains.<facet>` subscription symbol +
  `published/<facet>/…` subtree).
- each control has: a named owner, framework mapping, evidence requirement,
  current artifact reference, freshness status, review status, and known gaps
- immaterial everywhere: scan timestamps and source request ids
- freshness: each control carries `last_reviewed` and a `valid_until` that lapses
  on the weekly (audit-prep) or monthly (otherwise) cadence
- postcondition: every accepted evidence artifact has a source reference, review
  timestamp, and evidence fingerprint
- postcondition: every gap has a named owner, reason, severity, and next action
- postcondition: unverified screenshots, informal notes, or expired exports are
  never accepted without marking the risk

#### status

Material: per-control readiness (`accepted`, `stale`, `missing`, `exception`, or
`needs-human-review`) with cited evidence and confidence. A readiness dashboard
subscribes here and wakes when a control's status moves, not when the gap queue
or evidence register churns.

#### gaps

Material: owner-ready follow-up grouped by control owner with severity, due date,
and audit-ready notes.

#### register

Material: durable evidence history — fingerprints, exception context, owner
follow-up, and next review timing — preserved across renders.

### Continuity

- self-driven: review active-control evidence at least weekly during audit
  preparation and at least monthly otherwise
- input-driven: material control changes, failed checks, new policy exceptions,
  or incoming audit requests wake a review before the next scheduled cadence

### Invariants

- Do not expose sensitive customer, employee, or security details beyond the
  compliance owners who need them.
- Keep follow-up requests narrow enough that control owners can act on them.

### Execution

```prose
let scope = call collect-control-scope
  evidence-signals: evidence-signals
  prior-controls: controls

let assessments = call inspect-evidence
  control-scope: scope.control-scope

let brief = call prepare-gap-brief
  evidence-assessments: assessments.evidence-assessments

return {
  status: assessments.evidence-assessments,
  gaps: brief.evidence-brief,
  register: assessments.evidence-assessments
}
```
