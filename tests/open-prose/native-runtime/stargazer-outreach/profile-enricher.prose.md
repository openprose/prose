---
name: profile-enricher
kind: service
---

### Requires

- `stargazers`: GitHub usernames and public profile URLs to evaluate

### Ensures

- `enriched_profiles`: likely organizations, company context, role signals,
  customers, repository activity, and confidence notes for each stargazer

### Invariants

- Preserve uncertainty instead of guessing private facts.
