---
name: github-star-events
kind: gateway
---

# GitHub Star Events

### Receives

- POST /webhooks/github/stars
- Provider: GitHub
- Event: star

### Emits

- high-intent-stargazer-outreach.evidence-change

### Payload

Pass the webhook payload as activation event context. The fulfillment system
should accept a single star event, a small batch of events, or an explicit
manual review request.
