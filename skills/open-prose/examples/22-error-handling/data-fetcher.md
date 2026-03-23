---
name: data-fetcher
kind: service
---

requires:
- api-endpoint: the API to query

ensures:
- data: fetched API response data
- if api is unavailable: cached data flagged as stale

errors:
- no-data: neither live nor cached data available

strategies:
- when rate limited: retry with exponential backoff up to 3 attempts
- when timeout: try once more with extended timeout
