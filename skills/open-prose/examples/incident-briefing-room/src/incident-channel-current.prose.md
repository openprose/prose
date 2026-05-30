---
name: incident-channel-current
kind: responsibility
id: 067NC4KG0NSK9D9P6WW3JEHV7G
---

# Incident Channel Current

### Goal

An active incident has a calm, current briefing room that gives responders,
support, and leadership the same operational picture.

### Requires

- `incident-events`: a current view of safe incident evidence — alerts, deploy
  notes, support signals, operator updates, mitigation results, and resolution
  notices

### Maintains

- `briefing`: the current incident briefing truth, with `brief`, `timeline`, and
  `actions` facets
- `brief` facet (material): current status, severity, affected customers or
  features, known facts, open questions, decisions, owners, and next update time
- `timeline` facet (material): incident timeline and decision history, preserved
  across renders for handoff and retrospective
- `actions` facet (material): owned follow-up actions with review timing, plus
  handoff notes for the next incident commander
- immaterial: render scan timestamps and event delivery ids
- freshness: `valid_until` reflects the next expected update time; during an
  active incident the brief should not be stale for more than fifteen minutes
- postcondition: customer-facing impact is stated only when supported by evidence
- postcondition: facts, assumptions, and open questions remain labeled separately
- postcondition: the next expected update time is present while the incident is
  active

### Continuity

- input-driven: reconcile the briefing when a new alert, deploy note, support
  signal, or operator update arrives
- self-driven: re-check during an active incident so the public brief does not go
  stale for more than fifteen minutes

### Invariants

- Do not invent facts or assign blame.
- Do not publish credentials, private customer data, or raw logs.
- Keep the briefing short enough for a responder joining mid-incident to scan.

### Execution

```prose
let signals = call collect-incident-signals
  incident-events: incident-events
  prior-briefing: briefing

let impact = call assess-customer-impact
  signal-summary: signals.signal-summary

let drafted = call draft-incident-brief
  signal-summary: signals.signal-summary
  impact-assessment: impact.impact-assessment
  open-impact-questions: impact.open-impact-questions

let actions = call review-incident-actions
  brief-gaps: drafted.brief-gaps
  timeline-updates: signals.timeline-updates
  impact-assessment: impact.impact-assessment

return {
  brief: drafted.incident-brief,
  timeline: signals.timeline-updates,
  actions: actions.next-actions
}
```
