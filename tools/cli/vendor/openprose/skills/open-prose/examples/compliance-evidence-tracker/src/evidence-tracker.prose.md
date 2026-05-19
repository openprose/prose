---
name: evidence-tracker
kind: system
---

# Evidence Tracker

### Description

Reviews compliance control evidence, identifies stale or missing artifacts,
prepares owner-ready gap follow-up, and updates the durable evidence register.

### Services

- `collect-control-scope`
- `inspect-evidence`
- `prepare-gap-brief`
- `update-evidence-register`

### Requires

- `activation_event`: a scheduled review request, evidence change event,
  responsibility pressure record, audit request, or manual control review
  request

### Ensures

- `evidence_brief`: reviewed controls with evidence status, freshness,
  acceptance notes, and owner-ready follow-up
- `register_update`: durable control evidence history, evidence fingerprints,
  exception context, owners, and next review timing

### Invariants

- Every accepted evidence artifact has a source reference, review timestamp,
  and evidence fingerprint.
- Every gap has a named owner, reason, severity, and next action.
- Prior exception and acceptance history is preserved so repeat findings remain
  explainable.

### Runtime

- `persist`: project
