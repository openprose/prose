---
name: inbox
kind: gateway
---

### Goal

Accept external items arriving at the edge and expose them as a materialized
set that other responsibilities can subscribe to.

### Maintains

The set of accepted items. Material: the item set (unordered) and each item's
id and body.

#### items
The accepted item set, folded from the external arrivals staged at the edge.

### Continuity

- external-driven: wake when a new item arrives at the gateway.
