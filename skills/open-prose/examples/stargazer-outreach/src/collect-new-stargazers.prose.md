---
name: collect-new-stargazers
kind: function
---

# Collect New Stargazers

### Description

Normalizes incoming star events and compares them with the prior outreach truth
the calling responsibility maintains.

### Parameters

- `stargazers`: a GitHub star event, batch of star events, pressure record, or
  manual review request
- `prior-outreach`: prior reviewed stargazers and contact safety notes read from
  the responsibility's world-model

### Returns

- `candidate-stargazers`: stargazers that need review, each with login,
  repository, first seen time, trigger reason, and duplicate-contact context
- each candidate has: enough source context for public enrichment

### Shape

- `self`: normalize events, deduplicate against the prior outreach truth, and
  select candidates for enrichment
- `prohibited`: network calls beyond the provided input

### Strategies

- when the activation is pressure without a concrete star event: select stale
  qualified leads from the prior truth for re-review
- when duplicate history exists: include the history rather than dropping the
  candidate silently
