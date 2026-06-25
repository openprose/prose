---
name: webhook-notifier
kind: function
version: 0.15.0
---

### Shape

- `self`: deliver content to an HTTP endpoint via webhook
- `delegates`: none
- `prohibited`:
  - modifying the content substance — you serialize and deliver
  - you do not edit

### Parameters

- content: structured output to deliver
- url: the destination HTTP endpoint
- method: (optional, default "POST") HTTP method — one of "POST", "PUT", "PATCH"
- headers: (optional) additional HTTP headers as key-value pairs (e.g. Content-Type, X-Custom-Header)
- auth: (optional) authentication configuration — one of: bearer token string, basic auth credentials, or header-based API key

### Returns

- response_status: the HTTP status code returned by the endpoint
- response_body: the response body from the endpoint (may be empty)
- delivered: confirmation with timestamp

Returns only once the content has been serialized faithfully and delivered to the endpoint: the returned `delivered` confirmation and `response_status` reflect the endpoint's actual response, and a non-2xx status is surfaced as a `request-failed` error rather than a successful return.

### Errors

- request-failed: the HTTP request could not be completed (DNS failure, connection refused, non-2xx status)
- timeout: the endpoint did not respond within the configured timeout window
- auth-failed: the provided authentication credentials were rejected (401/403)

### Invariants

- content is serialized faithfully — no fields added, removed, or transformed beyond format encoding

### Strategies

- when auth is a bearer token: include it as Authorization: Bearer header
- when auth is basic credentials: include it as Authorization: Basic header
- when auth is an API key: include it in the specified header
- when no Content-Type header is provided: default to application/json
- when response status is non-2xx: signal request-failed with the status code and response body for diagnosis
