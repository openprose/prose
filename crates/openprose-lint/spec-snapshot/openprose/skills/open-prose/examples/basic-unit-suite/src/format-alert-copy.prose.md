---
name: format-alert-copy
kind: function
version: 0.15.0
---

# Format Alert Copy

> A stateless helper (U07). It is a **called function**, not a graph node: it has
> no world-model, no continuity, and nothing subscribes to it. `Alert Projection`
> calls it imperatively while rendering; its result is ephemeral and produces no
> receipt and no subscription edge.

### Parameters

- `AlertState`: the current `{ status, threshold }`.

### Returns

`AlertCopy`:

- `subject` — the alert subject line.
- `body` — the alert body copy.

### Execution

Compose a subject and body from the alert status and threshold and return them.
The trace shows this call **inside** the `Alert Projection` render; no separate
node, world-model, or downstream receipt is created for it. Downstream nodes can
subscribe only to `Alert Projection`, never to this function.
