---
name: render-digest-line
kind: function
---

# Render Digest Line

> A stateless helper the `digest` responsibility calls to format its brief from
> the upstream headline. A `function` declares `### Parameters -> ### Returns`,
> has no world-model, and no wake source — it is ephemeral and pure.

### Parameters

- `headline`: the upstream signal's one-line summary.
- `epoch`: the gateway epoch the headline was derived from.

### Returns

The formatted brief line, as a stateless value:

- `brief`: `"digest: <headline>"`.
- `source_epoch`: the `epoch` the brief was derived from.

It is **stateless** — it maintains nothing and reads nothing by reference; the
parent passes everything it needs as parameters and uses the returned value
directly.
