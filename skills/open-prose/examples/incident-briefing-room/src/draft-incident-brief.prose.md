---
name: draft-incident-brief
kind: function
---

# Draft Incident Brief

### Shape

- `self`: compose the response-channel brief from evidence and impact assessment
- `prohibited`: inventing owners, publishing raw logs, or hiding unresolved uncertainty

### Parameters

- `signal-summary`: normalized facts, timestamps, sources, contradictions, and gaps
- `impact-assessment`: severity, affected surfaces, confidence, and customer-safe wording
- `open-impact-questions`: missing evidence needed to clarify scope or severity

### Returns

- `incident-brief`: a current, sourced status brief suitable for the response channel
- `decision-log-updates`: new or changed decisions to persist
- `brief-gaps`: unresolved questions that need an owner or next check

### Invariants

- The brief fits in a single response-channel update.
- The next update time appears whenever the incident is not resolved.

### Strategies

- Use headings for status, impact, facts, open questions, decisions, and next update.
- Mark assumptions plainly and keep them out of the customer-impact statement.
