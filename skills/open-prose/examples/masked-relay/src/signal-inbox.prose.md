---
name: signal-inbox
kind: gateway
---

### Goal

Accept the messy weekly bundle of raw customer-intelligence signals — customer
calls, support tickets, lost-deal notes, and competitor changes — arriving at the
edge, and expose them as a materialized inbox the rest of the relay subscribes to.
This is the relay's single entry point.

### Maintains

The deduplicated set of accepted signals. Material: the signal set (unordered),
and each signal's `id`, `source`, and `text`.

#### ledger
The accepted-signal set folded from the external arrivals staged at the edge.
This is the named facet the Signal Ledger subscribes to — a re-delivery that adds
no new distinct signal does not move it, so the whole relay stays quiet.

### Continuity

- external-driven: wake when a new signal payload arrives at the gateway. This is
  the entry point; nothing upstream wakes it.
