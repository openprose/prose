---
role: reactor-semantics
summary: |
  Evented reconciliation model for Responsibility Runtime. Read this
  file when designing triggers, judge activations, maintenance feedback, or
  responsibility pressure.
see-also:
  - ../responsibility-runtime.md: Responsibility Runtime stack and layer boundaries
  - responsibility.md: Responsibility semantic contract
  - ../prose.md: Bounded VM run semantics
  - ../forme.md: Fulfillment wiring semantics
---

# Reactor

Reactor is the evented reconciliation model for Responsibility Runtime.

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

The v0 status record stays narrow:

- `kind: openprose.responsibility-status`
- `version: 0`
- `responsibilityId`
- `responsibilityFingerprint`
- `status`
- `evidence`
- `recordedAt`
- `source`

The static judge service writes `latest.json` and appends `status.jsonl` under
`<openprose-root>/state/responsibilities/{responsibility-id}/`.

## Pressure

Pressure is the feedback signal produced when status is unhealthy.

Pressure should be just strong enough to activate fulfillment, retry, or
escalation. It is not a broad policy engine.

The first useful pressure record needs only:

- `kind: openprose.responsibility-pressure`
- `version: 0`
- `pressureId`
- `dedupeKey`
- responsibility identity and fingerprint
- status
- evidence summary
- recommended activation class
- optional activation id
- reason, recorded time, and source status metadata

The runtime writes `pressure.latest.json` and appends `pressure.jsonl` beside
the responsibility status files. Repeated pressure for the same source status
is not appended again and should not launch duplicate work.

Pressure wakes a normal bounded activation through a virtual
`{responsibility-id}.pressure` event. It is control context for the activation,
not a second workflow language.

## Judge Cadence

The judge is not always running. The compiler derives cadence from the
responsibility's `Continuity` section and emits concrete cron triggers when
cadence is clear. Optional gateways may declare additional HTTP or schedule
triggers. `prose serve` reads only those concrete trigger records.

Model choice for the judge is runtime policy, not responsibility source.

## Fulfillment

Fulfillment runs only when the responsibility is drifting, down, blocked, or
explicitly requested.

When fulfillment needs a multi-service system, Forme supplies the compiled
manifest and the Prose VM runs a normal bounded activation. Pressure-triggered
fulfillment should receive the responsibility, unhealthy status evidence,
pressure record, and original event context.
