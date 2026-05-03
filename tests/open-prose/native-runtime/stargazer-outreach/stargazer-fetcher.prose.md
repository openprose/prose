---
name: stargazer-fetcher
kind: service
---

### Requires

- `github_repository`: repository whose new stargazers should be evaluated
- `activation_event`: trigger event or manual request that woke this run

### Ensures

- `stargazers`: GitHub usernames and public profile URLs to evaluate, with
  enough provenance to avoid duplicate processing
