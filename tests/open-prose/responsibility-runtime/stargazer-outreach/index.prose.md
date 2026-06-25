---
name: stargazer-outreach
kind: system
version: 0.15.0
---

# Stargazer Outreach

### Services

- `stargazer-fetcher`
- `profile-enricher`
- `program-proposer`
- `sample-runner`
- `outreach-drafter`

### Requires

- `github_repository`: repository whose new stargazers should be evaluated
- `activation_event`: trigger event or manual request that woke this run

### Ensures

- `outreach_packet`: qualified prospects, evidence, proposed OpenProse
  programs, sample result pointers, and draft outreach where appropriate

### Invariants

- Do not produce outreach for unqualified prospects.
- Preserve uncertainty and evidence gaps.
