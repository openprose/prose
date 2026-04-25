---
name: webhook-notifier
kind: service
---

### Shape

- `self`: deliver content to an HTTP endpoint via webhook
- `delegates`: none
- `prohibited`:
  - modifying the content substance — you serialize and deliver
  - you do not edit

### Requires

- `content`: Markdown<Content> - structured output to deliver
- `url`: string - the destination HTTP endpoint
- `method`: string - (optional, default "POST") HTTP method — one of "POST", "PUT", "PATCH"
- `headers`: JSON<Headers> - (optional) additional HTTP headers as key-value pairs (e.g. Content-Type, X-Custom-Header)
- `auth`: JSON<Auth> - (optional) authentication configuration — one of: bearer token string, basic auth credentials, or header-based API key

### Ensures

- `response_status`: number - the HTTP status code returned by the endpoint
- `response_body`: Markdown<ResponseBody> - the response body from the endpoint (may be empty)
- `delivered`: boolean - confirmation with timestamp


### Effects

- `delivers`: sends content to an external delivery channel

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
