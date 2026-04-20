---
name: error-handling-demo
kind: program
---

### Services

- `data-fetcher`
- `config-parser`
- `db-worker`

### Requires

- `api-endpoint`: the API to fetch data from
- `config-path`: path to configuration file

### Ensures

- `data`: fetched and parsed data from the API
- if api is unavailable: cached data with staleness warning
- if config is invalid: partial result with default configuration applied
- if database is unreachable: error report with connection diagnostics

### Errors

- `unrecoverable`: all fallback paths exhausted

### Invariants

- all attempted operations are logged with timestamps
