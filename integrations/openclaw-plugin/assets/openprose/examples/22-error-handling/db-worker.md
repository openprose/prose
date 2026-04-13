---
name: db-worker
kind: service
---

requires:
- data: data to process
- config: database configuration

ensures:
- result: processed and stored data with confirmation
- if database is unreachable: error report with connection diagnostics

errors:
- db-failure: database connection failed after all retry attempts

strategies:
- when connection fails: retry up to 3 times with backoff
- when timeout: try with reduced batch size
