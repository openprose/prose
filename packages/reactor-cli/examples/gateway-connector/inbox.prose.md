---
name: inbox
kind: gateway
---

### Goal

Accept external support tickets arriving from the help desk and expose them as a
materialized inbox other responsibilities can subscribe to.

### Maintains

The set of accepted tickets. Material: the ticket set (unordered) and each
ticket's id and body.

#### tickets
The accepted ticket set, folded from the external arrivals staged at the edge.

### Continuity

- external-driven: wake when a new ticket arrives at the gateway.
