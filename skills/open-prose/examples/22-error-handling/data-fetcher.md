---
name: data-fetcher
kind: service
---

### Requires

- api-endpoint: the API to query

### Ensures

- data: fetched API response data
- if api is unavailable: cached data flagged as stale

### Errors

- no-data: neither live nor cached data available

### Strategies

- when rate limited: retry with exponential backoff up to 3 attempts
- when timeout: try once more with extended timeout
