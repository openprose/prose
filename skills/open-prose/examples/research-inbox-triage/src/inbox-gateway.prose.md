---
name: inbox-gateway
kind: gateway
---

# Inbox Gateway

### Continuity

- external-driven

### Schedule

- Every weekday at 09:00 local time, check for untriaged research inbox items.

### Receives

- POST /inbox/items
- Local event: research inbox item created or updated

### Maintains

- `inbox-items`: the latest incoming research submissions as structured truth
- each item carries: submitted text, source URL when present, submitter note,
  received timestamp, and any active research-question tags
- immaterial: webhook delivery ids and receipt timestamps

### Emits

- research-inbox-responsibility

### Payload

Pass the submitted item text, source URL when present, submitter note, received
timestamp, and any active research-question tags as the incoming truth.
