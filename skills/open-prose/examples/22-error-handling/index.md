---
name: error-handling-demo
kind: program
services: [data-fetcher, config-parser, db-worker]
---

requires:
- api-endpoint: the API to fetch data from
- config-path: path to configuration file

ensures:
- data: fetched and parsed data from the API
- if api is unavailable: cached data with staleness warning
- if config is invalid: partial result with default configuration applied
- if database is unreachable: error report with connection diagnostics

errors:
- unrecoverable: all fallback paths exhausted

invariants:
- all attempted operations are logged with timestamps
