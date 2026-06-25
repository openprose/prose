---
name: renewal-review-events
kind: gateway
version: 0.15.0
---

# Renewal Review Events

> The gateway for external input — sugar for an external-driven responsibility.
> It is the system's ingress: it has no `### Requires` (its input arrives from
> outside the graph), it `### Maintains` the latest incoming-event truth, and its
> `### Continuity` is **external-driven**, which is how Forme finds it as a DAG
> entry point.

### Continuity

external-driven

A webhook, the scheduled cron below, or a manual kick translates into a *receipt*
at the system's edge — one wake event type, external source. The gateway turns
that trigger into the incoming truth the `collect-renewal-signals` responsibility
subscribes to.

### Schedule

- Every weekday at 09:00 local time (the self-kick that ensures a scan happens
  even when no webhook fires).

### Receives

- POST /webhooks/vendor-renewals/events
- Provider: Internal procurement, finance, and vendor-management systems
- Event: renewal-window-change

### Maintains

The latest incoming renewal-review event, as the structured truth downstream
subscribes to:

- `renewal_events`: `{ items: RenewalEvent[], received_at }` where each
  `RenewalEvent` carries the scheduled review request, vendor ids, contract-window
  changes, spend updates, usage changes, or manual-review request as activation
  context. A portfolio scan or a focused batch of vendors are both valid shapes.

**Canonicalization spec**: the event `items` (by stable id) are material;
`received_at` and transport request-ids are immaterial — a re-POST of the same
event does not move the fingerprint. `collect-renewal-signals` then applies its
own watermark for cross-event dedup.

### Payload

Pass the scheduled review request, vendor ids, contract-window changes, spend
updates, usage changes, or manual-review request as event context. Downstream
accepts either a portfolio scan or a focused batch of vendors.
