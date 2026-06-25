---
name: collect-incident-signals
kind: function
version: 0.15.0
---

# Collect Incident Signals

### Shape

- `self`: normalize safe incident evidence from the event and the prior briefing
- `prohibited`: fetching private logs, exposing secrets, or deciding severity alone

### Parameters

- `incident-events`: the latest safe event context for an active incident
- `prior-briefing`: the responsibility's prior briefing truth, including the last
  published brief and the incident timeline, read from its world-model

### Returns

- `signal-summary`: normalized facts, timestamps, sources, contradictions, and gaps
- `timeline-updates`: candidate timeline entries safe to persist

### Errors

- `insufficient-event-context`: the event lacks a summary, source, or incident identity

### Strategies

- Prefer explicit timestamps from the event; otherwise mark timing as reported order.
- Carry forward unresolved questions from the prior brief unless new evidence answers them.
