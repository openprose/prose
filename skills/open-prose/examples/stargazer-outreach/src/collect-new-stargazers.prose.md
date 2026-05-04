---
name: collect-new-stargazers
kind: service
---

# Collect New Stargazers

### Description

Normalizes incoming star events and compares them with the durable outreach
ledger.

### Requires

- `activation_event`: a GitHub star event, batch of star events, pressure
  record, or manual review request

### Ensures

- `candidate_stargazers`: stargazers that need review, each with login,
  repository, first seen time, trigger reason, and duplicate-contact context
- each candidate has: enough source context for public enrichment

### Runtime

- `persist`: project

### Memory

```yaml
reads:
  - outreach_ledger: prior reviewed stargazers and contact safety notes
  - latest_star_event_at: newest processed star event timestamp
writes:
  - latest_star_event_at: advanced when newer events are accepted for review
```

### Shape

- `self`: normalize events, deduplicate against project memory, and select
  candidates for enrichment
- `prohibited`: network calls beyond the provided activation context

### Strategies

- when the activation is pressure without a concrete star event: select stale
  qualified leads from the ledger for re-review
- when duplicate history exists: include the history rather than dropping the
  candidate silently
