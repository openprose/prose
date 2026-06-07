---
name: theme-tagger
kind: responsibility
---

# Theme Tagger

One theme-tagger per incoming feedback message. Each subscribes to ONLY its own
`feedback:<id>` facet on the Feedback Inbox gateway, classifies the message with
a cheap model, and exposes the tagged truth the aggregator groups on.

This is the cheap classification seam: a small model assigns a `theme` from
`{pricing, performance, onboarding, integrations}` and a coarse `sentiment` from
`{positive, neutral, negative}`, and carries a short canonical `quote` through
verbatim. A new message to one id lights ONLY that tagger lane; every sibling
tagger stays dark.

### Requires

- `feedback`: this tagger's own message slice, subscribed via the gateway's
  `feedback:<id>` facet ONLY. A different message moves a different facet, so
  this tagger stays dark — it never wakes on a sibling's feedback.

### Maintains

- `tagged`: this message's tag truth — its `theme`, `sentiment`, and the
  canonical `quote` the aggregator tallies. The quote is carried through
  VERBATIM (never paraphrased), so a downstream brief can cite it directly.
- immaterial: parse timestamps and the delivery revision counter — a
  byte-identical re-delivery moves nothing.
- postcondition: every tagged message carries exactly one of the four themes and
  one of the three sentiments; the quote is a substring of the inbound message.

#### tagged

Material: the fingerprint of `{theme, sentiment, quote}`. Moves only when the
classification or the carried quote changes — a re-delivery of identical text
leaves it still.

### Continuity

- input-driven: a new or changed message on this tagger's own gateway facet
  wakes it. A re-delivery of identical text memo-skips at zero fresh.
