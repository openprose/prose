---
name: signals
kind: gateway
version: 0.15.0
---

# Signals

> The gateway for external input — the system's ingress. It has no `### Requires`
> (its input arrives from outside the graph), it `### Maintains` the latest
> incoming signal as the truth the `digest` responsibility subscribes to, and its
> `### Continuity` is **external-driven**, which is how Forme finds it as a DAG
> entry point.

### Continuity: external-driven

A webhook, a scheduled poll, or a manual kick translates into a *receipt* at the
edge of the system — one wake event type, an external source. The gateway turns
that trigger into the normalized truth the downstream `digest` reads.

Because this node is external-driven, it is an **entry point**: a wake enters the
graph here. A re-wake that carries a byte-identical signal moves nothing, so the
gateway memo-**skips** — and a skip propagates nothing, so the digest is never
even woken. That is the load-bearing lesson: cost scales with surprise, not with
how often you poll.

### Receives

- A normalized signal payload (a headline summarizing the latest external event).
- Provider: any upstream feed, cron, or webhook the harness wires to this entry.

### Maintains

The latest incoming signal, as the structured truth the digest subscribes to:

- `headline`: a one-line summary of the latest external event.
- `epoch`: a monotone marker of which delivery produced this truth.

This is a facet-less producer: it exposes its whole maintained truth as the
single **atomic facet** (the exported `ATOMIC_FACET` constant — never a `"*"`
wildcard, which would silently never propagate). The digest subscribes to that
atomic facet, so it wakes exactly when — and only when — this gateway's truth
moves.

A render reads its prior truth **by reference** (it does not re-fetch the world);
it self-polices these postconditions before signing its receipt — there is **no
separate judge beat**.

### Emits

- digest

When this gateway's atomic facet moves, Forme wakes the subscribing
responsibility (keyed on the node, no judge-era wake-channel suffix).
