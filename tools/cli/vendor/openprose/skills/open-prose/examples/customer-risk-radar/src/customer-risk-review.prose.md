---
name: customer-risk-review
kind: gateway
---

# Customer Risk Review

### Schedule

- Every weekday at 08:30 local time.

### Receives

- POST /webhooks/customer-risk/signals
- Provider: Internal customer data pipeline
- Event: account-signal-change

### Emits

- customer-risk-maintained.evidence-change

### Payload

Pass the scheduled review request, changed account ids, or account signal batch
as activation event context. The fulfillment system should accept a scheduled
portfolio scan, a small batch of changed accounts, or an explicit manual review
request.
