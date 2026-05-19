---
name: stargazer-outreach
kind: system
---

# Stargazer Outreach

### Description

Finds promising new stargazers, enriches public context, qualifies fit, drafts
useful outreach, and updates the durable outreach ledger.

### Services

- `collect-new-stargazers`
- `enrich-stargazer`
- `qualify-stargazer`
- `draft-outreach`
- `record-outreach-decision`

### Requires

- `activation_event`: a GitHub star event, batch of star events, pressure
  record, or manual review request

### Ensures

- `outreach_batch`: reviewed stargazers with qualification, evidence, and
  human-ready outreach drafts where appropriate
- `ledger_update`: durable record of reviewed stargazers and duplicate-contact
  safeguards

### Invariants

- Every outreach draft is tied to concrete public evidence.
- Every reviewed stargazer is recorded, including those rejected or deferred.
- Human approval is required before any message is sent.

### Runtime

- `persist`: project
