---
name: stargazer-refresh
kind: service
---

### Runtime

- `freshness`: 6h

### Requires

- `org`: string - GitHub organization to inspect

### Ensures

- `report`: Markdown<StargazerReport> - fresh organization report

### Effects

- `read_external`: GitHub API, freshness 6h
