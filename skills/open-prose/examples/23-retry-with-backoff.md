---
name: retry-with-backoff
kind: service
---

Demonstrates strategies for resilient API calls. Retry/backoff logic is expressed declaratively via `### Strategies` rather than imperative `retry:` and `backoff:` keywords.

### Requires

- api-endpoint: the API to call
- payload: data to send

### Ensures

- response: successful API response data
- if primary endpoint is unavailable: response from backup endpoint with source noted

### Errors

- all-endpoints-exhausted: neither primary nor backup responded after all retries

### Strategies

- when rate limited: retry with exponential backoff, up to 3 attempts
- when timeout: retry once with extended timeout
- when primary fails after all retries: fall back to backup endpoint
- when backup also fails: report both failure modes
