---
name: account-signals
kind: gateway
---

# Account Signals

> The gateway for external input — sugar for an external-driven responsibility.
> It is the system's ingress: it has no `### Requires` (its input arrives from
> outside the graph), it `### Maintains` the latest incoming-signal truth, and
> its `### Continuity` is **external-driven**, which is how the harness finds it
> as a DAG entry point.

### Continuity

external-driven

A product-usage webhook, a support-ticket event, a billing change, or the
weekday cron below translates into a *receipt* at the system's edge — one wake
event type, external source. The gateway turns that trigger into the incoming
signal truth the `renewal-risk` responsibility subscribes to. External-driven
nodes are the entry points of the graph.

### Emits

- renewal-risk

### Schedule

- Every weekday at 08:00 local time (the self-kick that ensures a health sweep
  happens even when no webhook fires).

### Receives

- POST /webhooks/accounts/signals
- Provider: product telemetry, support desk, and billing systems
- Event: account-signal-change

### Maintains

The latest incoming account signals, as the structured truth downstream
subscribes to. Its subscribable parts are the per-account `####` facets — each
`####` part *is* a facet (a fingerprint unit, so a subscriber wakes only when
*that* account's slice moves).

- `signals`: `{ accounts: AccountSignal[], received_at }` where each
  `AccountSignal` carries product-usage trend, support friction, renewal-window
  timing, and stakeholder movement for one active customer.

**Canonicalization spec**: each account's signal slice (keyed by stable
`account_id`) is material; `received_at` and transport request-ids are
immaterial — a re-POST of the same signals does not move any fingerprint. This
is the selective-wake boundary: a change to *one* account perturbs *only* that
account's facet, so only that account is re-judged downstream.

#### acct

Material per account: the usage trend, support friction, renewal timing, and
stakeholder notes for a single customer. A downstream re-judges an account when —
and only when — its `acct` slice moves.

### Payload

Pass a portfolio sweep or a focused batch of accounts as signal context.
Downstream accepts either shape.
