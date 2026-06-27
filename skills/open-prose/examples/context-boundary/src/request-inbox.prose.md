---
name: request-inbox
kind: gateway
version: 0.15.0
---

# Request Inbox

External entry point for one request payload. This gateway is intentionally
boring: it receives a request body, normalizes it, and publishes the latest
request as maintained truth.

### Continuity

- external-driven: a `reactor trigger request-inbox --data ...` call wakes this
  gateway. It has no upstream `### Requires`.

### Receives

- `reactor trigger request-inbox --data <json>`

### Maintains

- `request`: the latest staged request payload, normalized as structured truth.

#### request

Material: request id, source revision, goal, and any caller-supplied request
fields needed by downstream responsibilities.

### Payload

The trigger body should include:

- `id`: stable request id.
- `source_revision`: source or prompt revision that produced the request.
- `goal`: the user's requested outcome.

### Execution

- Read the staged trigger payload from the gateway ingress inbox.
- Normalize it as `state/request.json`.
- Do not write a brief here; this node only maintains the request truth.
