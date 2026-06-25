---
name: release-readiness-events
kind: gateway
version: 0.15.0
---

# Release Readiness Events

### Continuity

- external-driven

### Receives

- POST /release/readiness
- Payloads may describe a candidate cut, CI result, merged change summary,
  migration note, docs update, risk review, manual approval, or rollback note.

### Maintains

- `release-events`: the latest incoming release evidence as structured truth
- each event carries: `release_id`, `source`, `reported_at`, `summary`, and safe
  links to CI, pull requests, docs, or runbooks
- immaterial: webhook delivery ids and receipt timestamps

### Emits

- release-candidate-ready

### Payload

Pass the event body as the incoming truth. Include `release_id`, `source`,
`reported_at`, `summary`, and safe links to CI, pull requests, docs, or runbooks
when available.
