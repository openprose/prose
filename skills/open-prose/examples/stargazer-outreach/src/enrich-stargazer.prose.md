---
name: enrich-stargazer
kind: service
---

# Enrich Stargazer

### Description

Gathers bounded public context for each candidate stargazer.

### Requires

- `candidate_stargazers`: stargazers that need review

### Ensures

- `stargazer_profiles`: candidate profiles with public GitHub activity, project
  context, company or team clues, and notable workflow signals
- each profile has: cited evidence, confidence notes, and missing-context flags

### Environment

- `GITHUB_TOKEN`: optional token for higher GitHub API limits

### Shape

- `self`: use public GitHub and public web context to enrich candidates
- `prohibited`: private data collection, invasive profiling, or paid enrichment
  without explicit caller approval

### Strategies

- when public evidence is sparse: mark the profile as low confidence instead of
  guessing
- when a profile appears personal or student-only: keep the recommendation
  conservative
