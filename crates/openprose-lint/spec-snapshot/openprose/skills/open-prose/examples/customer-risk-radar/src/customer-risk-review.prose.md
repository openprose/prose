---
name: customer-risk-review
kind: gateway
version: 0.15.0
---

# Customer Risk Review

### Continuity

- external-driven

### Schedule

- Every weekday at 08:30 local time.

### Receives

- POST /webhooks/customer-risk/signals
- Provider: Internal customer data pipeline
- Event: account-signal-change

### Maintains

- `account-signals`: the latest incoming customer signals as structured truth —
  scheduled review request, changed account ids, or account signal batch
- each signal carries: account id, signal kind, observed value or note, and the
  source timestamp
- immaterial: webhook delivery ids and receipt timestamps

### Emits

- customer-risk-maintained

### Payload

Pass the scheduled review request, changed account ids, or account signal batch
as the incoming truth. Accept a scheduled portfolio scan, a small batch of
changed accounts, or an explicit manual review request.
