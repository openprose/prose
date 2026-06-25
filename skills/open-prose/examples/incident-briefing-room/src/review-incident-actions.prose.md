---
name: review-incident-actions
kind: function
version: 0.15.0
---

# Review Incident Actions

### Shape

- `self`: turn brief gaps and timeline updates into concrete follow-up actions
- `prohibited`: assigning work to unavailable owners or expanding scope beyond incident response

### Parameters

- `brief-gaps`: unresolved questions that need an owner or next check
- `timeline-updates`: candidate timeline entries safe to persist
- `impact-assessment`: severity, affected surfaces, confidence, and customer-safe wording

### Returns

- `next-actions`: owned follow-up actions with review timing
- `handoff-notes`: compact notes for the next incident commander or retrospective owner

### Strategies

- Prefer one owner per action.
- If no owner is known, assign the action to the incident commander role rather than a named person.
