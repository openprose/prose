---
name: evidence-review-events
kind: gateway
---

# Evidence Review Events

### Schedule

- Every Monday at 09:00 local time.

### Receives

- POST /webhooks/compliance/evidence
- Provider: Internal compliance workspace
- Event: evidence-change

### Emits

- compliance-evidence-current.evidence-change

### Payload

Pass the scheduled review request, changed control ids, evidence artifact
updates, audit request details, or policy exception updates as activation event
context. The fulfillment system should accept a portfolio scan, a focused
control batch, or an explicit manual review request.
