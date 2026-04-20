---
name: db-worker
kind: service
---

### Requires

- data: data to process
- config: database configuration

### Ensures

- result: processed and stored data with confirmation
- if database is unreachable: error report with connection diagnostics

### Errors

- db-failure: database connection failed after all retry attempts

### Strategies

- when connection fails: retry up to 3 times with backoff
- when timeout: try with reduced batch size
