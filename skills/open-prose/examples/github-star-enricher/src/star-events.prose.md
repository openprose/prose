---
name: star-events
kind: gateway
version: 0.15.0
---

# GitHub Star Events

> The primary external entry point — the system's ingress for new GitHub stars.
> It has no `### Requires` (its input arrives from outside the graph), it
> `### Maintains` the latest batch of stargazers as the truth the registry
> subscribes to, and its `### Continuity` is **external-driven**, which is how
> Forme finds it as a DAG entry point.

### Continuity: external-driven

A GitHub star webhook, or a scheduled poll of the stargazers API, translates into
a *receipt* at the edge of the system — one wake event type, an external source.
The gateway normalizes the raw event (or poll page) into the per-user truth the
downstream `registry` reads, preserving a high-water mark / polling cursor so a
re-poll of the same page does not re-do work.

Because this node is external-driven, it is an **entry point**: a wake enters the
graph here. A re-poll that carries a byte-identical set of stars moves nothing, so
the gateway memo-**skips** — and a skip propagates nothing, so the entire fan-out
below it stays dark and spends zero fresh. That is the load-bearing lesson: cost
scales with surprise, not with how often you poll GitHub.

### Receives

- `repo`, `username`, `starred_at` for each new star.
- `github_event_id` or `polling_cursor` — the dedupe / high-water key.
- `source`: `webhook` or `poller`.

### Maintains

The latest batch of stargazers, as the structured truth the registry subscribes
to. Its canonicalizer exposes **one facet per starring user** so that a new star
on one user perturbs only that user's lane — the per-person fan-out boundary:

#### user:<login>

The fingerprint of a single user's star slice. A new star on `alice` moves only
`user:alice`; the sibling user facets are byte-identical, so the sibling fan-out
lanes are never even woken.
