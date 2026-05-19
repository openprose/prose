---
name: qualify-stargazer
kind: service
---

# Qualify Stargazer

### Description

Scores whether an enriched stargazer is a realistic OpenProse outreach lead.

### Requires

- `stargazer_profiles`: enriched public profiles with evidence and confidence
  notes

### Ensures

- `qualified_leads`: profiles labeled `qualified`, `defer`, or `reject` with a
  concise rationale and next action
- each lead has: fit score, evidence summary, outreach angle, and safety notes

### Invariants

- Rejections and deferrals are first-class outcomes.
- Low-confidence profiles are never promoted to high-intent leads.

### Shape

- `self`: evaluate fit and identify plausible OpenProse workflows
- `prohibited`: manufacturing urgency or stretching weak evidence into a lead

### Strategies

- when fit is strong but contact risk is high: qualify the lead but recommend
  no immediate outreach
- when the stargazer appears to maintain agent tooling, docs workflows, release
  processes, or support operations: look for a concrete reusable program idea
