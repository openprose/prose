---
name: incident-events
kind: gateway
---

# Incident Events

### Receives

- POST /incident/events
- Payloads may describe alerts, deploy notes, support escalations, operator
  updates, mitigation results, or resolution notices.

### Emits

- incident-channel-current.evidence-change

### Payload

Pass the event body as activation context. Include `incident_id`, `source`,
`reported_at`, `summary`, and any safe supporting links when available.
