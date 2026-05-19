---
name: review-incident-actions
kind: service
---

# Review Incident Actions

### Shape

- `self`: turn brief gaps and timeline updates into concrete follow-up actions
- `prohibited`: assigning work to unavailable owners or expanding scope beyond incident response

### Requires

- `brief_gaps`: unresolved questions that need an owner or next check
- `timeline_updates`: candidate timeline entries safe to persist
- `impact_assessment`: severity, affected surfaces, confidence, and customer-safe wording

### Ensures

- `next_actions`: owned follow-up actions with review timing
- `handoff_notes`: compact notes for the next incident commander or retrospective owner

### Strategies

- Prefer one owner per action.
- If no owner is known, assign the action to the incident commander role rather than a named person.
