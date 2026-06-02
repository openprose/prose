---
name: customer-intake
kind: responsibility
id: 067NC4KG05XGS38E1W8124GK2G
---

# Customer Intake

### Goal

Promising customer requests are noticed, understood, and routed to a useful
next action.

### Requires

- A current view of `customer_signal`: evidence and context for an open
  customer request.

### Maintains

The routed-request truth.

- A list of promising requests. For each: the request id, the gathered
  evidence, the request context, and a recommended next action. Material:
  the request id, the next action, and a stable digest of the evidence.
  Immaterial: any `fetched_at` timestamp.
- Postcondition: each promising request has evidence, context, and a
  recommended next action.

### Continuity

- self-driven: review open requests often enough that promising requests are
  not stale for more than one week.

### Invariants

- Do not fabricate context or overstate certainty.

### Tools

(none)
