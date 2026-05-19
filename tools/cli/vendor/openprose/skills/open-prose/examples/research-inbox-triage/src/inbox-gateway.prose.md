---
name: inbox-gateway
kind: gateway
---

# Inbox Gateway

### Schedule

- Every weekday at 09:00 local time, check for untriaged research inbox items.

### Receives

- POST /inbox/items
- Local event: research inbox item created or updated

### Emits

- research-inbox-responsibility.evidence-change

### Payload

Pass the submitted item text, source URL when present, submitter note, received
timestamp, and any active research-question tags as activation event context.
