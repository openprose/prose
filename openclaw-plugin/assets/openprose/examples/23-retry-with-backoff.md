---
name: retry-with-backoff
kind: service
---

Demonstrates v2 strategies for resilient API calls. In v2, retry/backoff logic is expressed declaratively via `strategies:` rather than imperative `retry:` and `backoff:` keywords.

requires:
- api-endpoint: the API to call
- payload: data to send

ensures:
- response: successful API response data
- if primary endpoint is unavailable: response from backup endpoint with source noted

errors:
- all-endpoints-exhausted: neither primary nor backup responded after all retries

strategies:
- when rate limited: retry with exponential backoff, up to 3 attempts
- when timeout: retry once with extended timeout
- when primary fails after all retries: fall back to backup endpoint
- when backup also fails: report both failure modes
