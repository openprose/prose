---
name: support-inbox
kind: gateway
---

# Support Inbox

The entry point. Watches the inbound support address
(`support@agents.openprose.ai`, a primitive.dev inbound inbox) and re-projects
each incoming email into its own independent facet, so a delivery moves ONLY
that email's facet — every sibling lane stays dark.

### Continuity

- external-driven

This gateway is the single entry point of the graph. It does not subscribe to any
upstream responsibility; it is woken by the outside world (a new or re-delivered
email arriving at the support address).

### Receives

- POST /inbox/primitive — a primitive.dev email webhook
- Local event: an email is delivered (or re-delivered) to the support inbox

### Maintains

- `mailbox`: the latest per-email view of the inbound support inbox, keyed by
  email id. Each `email:<id>` facet below is the fingerprint of ONLY that one
  email's slice — so a delivery moves exactly one facet and lights exactly one
  downstream triage lane (the dark-lane boundary).
- immaterial: webhook delivery ids and receipt timestamps — re-delivering the
  byte-identical email moves nothing, so the whole graph memo-skips.

#### email:b1

Material: a bug report. Carries the canonical subject + body.

#### email:f1

Material: a feature request.

#### email:d1

Material: a documentation question.

#### email:sp1

Material: a spam email. Its triage's cheap filter rejects it; its `routed` facet
stays NULL and wakes nothing downstream (the dark graph on junk).

#### email:d2

Material: a second documentation question (and, on re-delivery, a duplicate of
the same canonical question from a different sender).

#### email:b2

Material: a second bug report.

### Payload

Pass each email's id, sender, canonical subject, canonical body, and a delivery
revision counter. The canonical subject + body are what the triage filter carries
through VERBATIM and the router catalogues — re-delivering the same canonical
content from a different sender moves nothing.
