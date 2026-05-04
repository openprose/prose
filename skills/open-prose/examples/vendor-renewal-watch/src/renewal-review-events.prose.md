---
name: renewal-review-events
kind: gateway
---

# Renewal Review Events

### Schedule

- Every weekday at 09:00 local time.

### Receives

- POST /webhooks/vendor-renewals/events
- Provider: Internal procurement, finance, and vendor-management systems
- Event: renewal-window-change

### Emits

- vendor-renewals-prepared.evidence-change

### Payload

Pass the scheduled review request, vendor ids, contract-window changes, spend
updates, usage changes, or manual review request as activation event context.
The fulfillment system should accept a portfolio scan or a focused batch of
vendors.
