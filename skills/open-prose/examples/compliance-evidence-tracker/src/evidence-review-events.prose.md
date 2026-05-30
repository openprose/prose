---
name: evidence-review-events
kind: gateway
---

# Evidence Review Events

### Continuity

- external-driven

### Schedule

- Every Monday at 09:00 local time.

### Receives

- POST /webhooks/compliance/evidence
- Provider: Internal compliance workspace
- Event: evidence-change

### Maintains

- `evidence-signals`: the latest incoming compliance evidence as structured truth
- each signal carries: changed control ids, evidence artifact updates, audit
  request details, or policy exception updates
- immaterial: webhook delivery ids and receipt timestamps

### Emits

- compliance-evidence-current

### Payload

Pass the scheduled review request, changed control ids, evidence artifact
updates, audit request details, or policy exception updates as the incoming
truth. Accept a portfolio scan, a focused control batch, or an explicit manual
review request.
