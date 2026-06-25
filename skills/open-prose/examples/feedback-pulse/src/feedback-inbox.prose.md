---
name: feedback-inbox
kind: gateway
version: 0.15.0
---

# Feedback Inbox

The entry point. Watches the inbound product-feedback inbox
(`feedback@agents.openprose.ai`, a primitive.dev inbound mailbox) and
re-projects each incoming message into its own independent facet, so a new
piece of feedback moves ONLY that message's facet — every sibling lane stays
dark. It also carries the standing weekly clock: a self-driven `week` facet that
advances the calendar even when the inbox is quiet, so the downstream weekly
pulse can refresh on cadence without any new feedback.

### Continuity

- external-driven: a new (or re-delivered) feedback message wakes this gateway.
- self-driven: a weekly clock tick advances the `week` facet (the cadence that
  lets the weekly pulse refresh even in a quiet week — see `### Schedule`).

This gateway is the single entry point of the graph. It does not subscribe to
any upstream responsibility; it is woken by the outside world (a feedback POST)
or by its own weekly clock.

### Receives

- POST /inbox/primitive
- Local event: a feedback message arrives at `feedback@agents.openprose.ai`.

### Schedule

- Every Monday at 09:00 local time the clock advances the `week` facet by one.
  This is the self-kick that ensures the weekly pulse refreshes on cadence even
  when no feedback message arrived all week (the `valid_until` continuity tick
  downstream rides this clock).

### Maintains

- `inbox`: the latest per-message view of the watched inbox, keyed by message
  id. Each `feedback:<id>` facet below is the fingerprint of ONLY that one
  message's slice — so a new message moves exactly one facet and lights exactly
  one downstream theme-tagger lane (the dark-lane boundary).
- `week`: the standing weekly clock. Material: the integer week index. Advances
  on the Monday self-tick; an identical re-delivery of feedback does NOT move it.
- immaterial: webhook delivery ids and receipt timestamps — re-delivering the
  byte-identical message moves nothing, so its lane memo-skips.

#### feedback:f1

Material: the first seeded feedback message.

#### feedback:f2

Material: the second seeded feedback message.

#### feedback:f3

Material: the third seeded feedback message.

#### feedback:f4

Material: a later feedback message (a fresh `pricing` complaint that lights only
the pricing lane mid-week).

#### week

Material: the integer week index. The weekly clock the pulse's freshness rides.

### Payload

Pass each message's id, the canonical quote text, and a delivery revision
counter. The clock carries only the integer week index.
