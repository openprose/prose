---
name: incident-briefing-room
kind: system
---

# Incident Briefing Room

### Description

Maintains a concise incident brief from noisy operational inputs while keeping
facts, customer impact, decisions, and next actions distinct.

### Services

- `collect-incident-signals`
- `assess-customer-impact`
- `draft-incident-brief`
- `review-incident-actions`

### Requires

- `incident_event`: the latest safe event context for an active incident
- `prior_brief`: the last published incident brief, if one exists
- `timeline`: current incident timeline and decision log from project state

### Ensures

- `incident_brief`: a current, sourced status brief suitable for the response channel
- `decision_log_updates`: new or changed decisions to persist
- `next_actions`: owned follow-up actions with review timing

### Invariants

- Facts, assumptions, and open questions remain labeled separately.
- Customer-facing impact is stated only when supported by evidence.
- The brief includes the next expected update time while the incident is active.

### Runtime

- `persist`: project
