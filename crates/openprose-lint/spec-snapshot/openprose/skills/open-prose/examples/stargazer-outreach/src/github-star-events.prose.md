---
name: github-star-events
kind: gateway
version: 0.15.0
---

# GitHub Star Events

### Continuity

- external-driven

### Receives

- POST /webhooks/github/stars
- Provider: GitHub
- Event: star

### Maintains

- `stargazers`: the latest incoming star events as structured truth
- each event carries: login, repository, starred-at time, and any source context
  the webhook provides
- immaterial: webhook delivery ids and receipt timestamps

### Emits

- high-intent-stargazer-outreach

### Payload

Pass the webhook payload as the incoming truth. Accept a single star event, a
small batch of events, or an explicit manual review request.
