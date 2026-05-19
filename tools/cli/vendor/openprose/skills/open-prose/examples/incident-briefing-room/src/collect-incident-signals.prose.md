---
name: collect-incident-signals
kind: service
---

# Collect Incident Signals

### Shape

- `self`: normalize safe incident evidence from the event, prior brief, and timeline
- `prohibited`: fetching private logs, exposing secrets, or deciding severity alone

### Requires

- `incident_event`: the latest safe event context for an active incident
- `prior_brief`: the last published incident brief, if one exists
- `timeline`: current incident timeline and decision log from project state

### Ensures

- `signal_summary`: normalized facts, timestamps, sources, contradictions, and gaps
- `timeline_updates`: candidate timeline entries safe to persist

### Errors

- `insufficient-event-context`: the event lacks a summary, source, or incident identity

### Strategies

- Prefer explicit timestamps from the event; otherwise mark timing as reported order.
- Carry forward unresolved questions from the prior brief unless new evidence answers them.

### Runtime

- `persist`: project
