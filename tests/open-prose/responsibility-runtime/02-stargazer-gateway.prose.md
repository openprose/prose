---
kind: gateway
version: 0.15.0
name: stargazer-events
---

# Stargazer Events

### Receives

- POST /webhooks/github/stars
- Provider: GitHub
- Event: star

### Emits

- high-intent-stargazer-outreach.evidence-change

### Payload

Pass the webhook payload as activation event context.
