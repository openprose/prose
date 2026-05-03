---
role: reactor-semantics
summary: |
  Evented reconciliation model for OpenProse Native Repositories. Read this
  file when designing triggers, judge activations, maintenance feedback, or
  responsibility pressure.
see-also:
  - ../native-runtime.md: Native runtime stack and layer boundaries
  - responsibility.md: Responsibility semantic contract
  - ../prose.md: Bounded VM run semantics
  - ../forme.md: Fulfillment wiring semantics
---

# Reactor

Reactor is the evented reconciliation model for OpenProse Native Repositories.

It replaces a task-loop mindset with this question:

> Given the latest event and durable state, which responsibilities need
> reconciliation now?

## Events

Treat these as events:

- timer ticks
- webhook deliveries
- queue messages
- file changes
- source changes
- manual requests
- judge drift
- fulfillment completion
- retry or escalation outcomes

Events wake the system. They do not imply one long-lived AI session.

## Reconciliation Loop

```text
event
  -> activation
  -> bounded run
  -> status or fulfillment result
  -> recorded state
  -> pressure if unhealthy
  -> another activation when needed
```

Responsibilities are durable. Activations are bounded. Continuity comes from
memory, run history, activation history, and judge status.

## Status

Judges record one of four coarse statuses:

| Status | Meaning |
|--------|---------|
| `up` | The responsibility appears maintained |
| `drifting` | The responsibility is at risk and should receive attention |
| `down` | The responsibility is not currently true |
| `blocked` | The system cannot determine or restore status without external help |

The status record should include concise evidence. The exact durable shape is
a compiler and harness decision, but v0 should stay narrow.

## Pressure

Pressure is the feedback signal produced when status is unhealthy.

Pressure should be just strong enough to activate fulfillment, retry, or
escalation. It is not a broad policy engine.

The first useful pressure record needs only:

- responsibility identity
- status
- evidence summary
- recommended activation class
- enough deduplication context to avoid uncontrolled duplicate runs

## Judge Cadence

The judge is not always running. The compiler derives cadence from the
responsibility's `Continuity` section and emits trigger intent that lets
`prose serve` wake judge activations often enough to detect drift before the
responsibility is violated.

Model choice for the judge is runtime policy, not responsibility source.

## Fulfillment

Fulfillment runs only when the responsibility is drifting, down, blocked, or
explicitly requested.

When fulfillment needs a multi-service system, Forme supplies the compiled
manifest and the Prose VM runs a normal bounded activation.
