---
name: release-readiness-events
kind: gateway
---

# Release Readiness Events

### Receives

- POST /release/readiness
- Payloads may describe a candidate cut, CI result, merged change summary,
  migration note, docs update, risk review, manual approval, or rollback note.

### Emits

- release-candidate-ready.evidence-change

### Payload

Pass the event body as activation context. Include `release_id`, `source`,
`reported_at`, `summary`, and safe links to CI, pull requests, docs, or runbooks
when available.
