---
name: inbox-stream
kind: gateway
---

# Inbox Stream

The entry point. Watches a raw mail feed and re-projects each incoming email into
its own independent facet, so a delivery to ONE inbox moves ONLY that email's
facet — every sibling lane stays dark.

### Continuity

- external-driven

This gateway is the single entry point of the graph. It does not subscribe to any
upstream responsibility; it is woken by the outside world (a new or re-delivered
email on the mail feed).

### Receives

- POST /inbox/deliver
- Local event: an email is delivered (or re-delivered) to one of the watched
  inboxes

### Maintains

- `mailbox`: the latest per-email view of the watched inboxes, keyed by email id.
  Each `email:<id>` facet below is the fingerprint of ONLY that one email's slice
  — so a delivery to one inbox moves exactly one facet and lights exactly one
  downstream classifier lane (the dark-lane boundary).
- immaterial: webhook delivery ids and receipt timestamps — re-delivering the
  byte-identical email moves nothing, so the whole graph memo-skips.

#### email:nl1

Material: the newsletter copy delivered to the first recipient.

#### email:nl2

Material: the newsletter copy delivered to the second recipient. Identical CONTENT
to `email:nl1`; only the recipient differs.

#### email:ship1

Material: the shipping-notification email.

#### email:invoice1

Material: the invoice email.

#### email:bad1

Material: the alert email. May arrive malformed — its classifier throws on parse,
producing a `failed` receipt that carries zero fresh and wakes nothing.

### Payload

Pass each email's id, recipient, canonical subject, canonical body, and a delivery
revision counter. The canonical subject + body are SHARED across the newsletter
copies — that sameness is what lets the threader collapse them to one thread.
