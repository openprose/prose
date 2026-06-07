---
name: press-inbox
kind: gateway
---

# Press Inbox

The entry point. Watches the inbound feed at `press@agents.openprose.ai` and
re-projects each incoming inquiry into its own independent facet, so a delivery of
ONE inquiry moves ONLY that inquiry's facet — every sibling lane stays dark.

### Continuity

- external-driven

This gateway is the single entry point of the graph. It does not subscribe to any
upstream responsibility; it is woken by the outside world (a new or re-delivered
inquiry on the inbound press feed).

### Receives

- POST /inbox/primitive
- Local event: an inquiry is delivered (or re-delivered) to the press inbox

### Maintains

- `mailbox`: the latest per-inquiry view of the inbound feed, keyed by email id.
  Each `email:<id>` facet below is the fingerprint of ONLY that one inquiry's
  slice — so a delivery moves exactly one facet and lights exactly one downstream
  relevance-filter lane (the dark-lane boundary).
- immaterial: webhook delivery ids and receipt timestamps — re-delivering the
  byte-identical inquiry moves nothing, so the whole graph memo-skips.

#### email:media1

Material: a media / press inquiry (an interview or feature request).

#### email:partner1

Material: a partnership inquiry (co-marketing, integration, alliance).

#### email:speak1

Material: a speaking inquiry (a conference or panel invitation).

#### email:blast1

Material: a PR blast / cold marketing email. Its relevance filter marks it
irrelevant and leaves its `qualified` facet NULL — the dark lane — so it never
wakes the opportunity register.

#### email:partner2

Material: a HIGH-importance partnership inquiry (strategic / acquisition). It
drives the briefing to the human gate.

### Payload

Pass each inquiry's id, sender name, sender email, subject, body, an inferred
kind (`media` / `partnership` / `speaking` / `irrelevant`), an importance flag
(`normal` / `high`), and a delivery revision counter. The sender name + email are
PII: they are owner-only and are STRIPPED from every public-facing projection
downstream.
