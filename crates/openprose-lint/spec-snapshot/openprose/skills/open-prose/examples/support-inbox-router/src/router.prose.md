---
name: router
kind: responsibility
version: 0.15.0
---

# Channel Router

The faceted fan-in. Subscribes to every triage's `routed` facet and catalogues
the ham messages into a faceted world-model with ONE FACET PER CHANNEL. This is
what turns one inbox into selective channels.

Each `####` channel facet is the fingerprint of ONLY that channel's catalogued
set (the canonical `{subject, body}` of its messages, deduped) — NOT the senders
and NOT the other channels. So a message routed to `docs` moves ONLY
`#### docs-questions`; a docs question never wakes the bug board. A spam triage's
`routed` facet is the fixed NULL token, so it fans in but moves nothing — junk
never lights a channel.

### Requires

- `routed-slices`: every triage's `routed` slice (the fan-in over the inbound
  emails). The router reads them by reference and catalogues each ham message
  into its channel. A spam slice (NULL) is simply absent — it catalogues nothing.

### Maintains

- `channels`: the catalogued set per channel. The `####` facets below are the
  per-channel subscription symbols a downstream listener selects on — each is the
  fingerprint of ONLY that channel's canonical content set (the dedup boundary).
- immaterial: per-channel ordering jitter and the sender set — a duplicate
  question from a different sender does not change a channel facet.

#### bug-reports

Material: the catalogued bug reports. Moves ONLY when a bug's canonical content
enters or changes. Subscribed by the Bug Board.

#### feature-requests

Material: the catalogued feature requests. Subscribed by Roadmap Signals.

#### docs-questions

Material: the catalogued documentation questions. Subscribed by the Docs Gap
Tracker. A duplicate question (same canonical content) does not move this facet.

#### billing

Material: the catalogued billing questions. **This facet has NO downstream
consumer on purpose** — a facet is a subscription SYMBOL and may have zero
subscribers; it simply stays dark when nothing subscribes (and here, nothing
does).

#### rollup

Material: the cheap per-channel tally (counts). Moves on any membership change so
a consumer that just wants the numbers can subscribe to the rollup alone.

### Continuity

- input-driven: a triage whose `routed` slice moved wakes the router. A spam
  re-decision (NULL → NULL) moves nothing, so the router stays dark on junk.
