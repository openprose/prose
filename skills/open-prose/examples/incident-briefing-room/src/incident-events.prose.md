---
name: incident-events
kind: gateway
---

# Incident Events

### Continuity

- external-driven

### Receives

- POST /incident/events
- Payloads may describe alerts, deploy notes, support escalations, operator
  updates, mitigation results, or resolution notices.

### Maintains

- `incident-events`: the latest incoming incident evidence as structured truth
- each event carries: `incident_id`, `source`, `reported_at`, `summary`, and any
  safe supporting links
- immaterial: webhook delivery ids and receipt timestamps

### Emits

- incident-channel-current

### Payload

Pass the event body as the incoming truth. Include `incident_id`, `source`,
`reported_at`, `summary`, and any safe supporting links when available.
