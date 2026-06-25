---
name: relevance-filter
kind: responsibility
version: 0.15.0
---

# Relevance Filter

One relevance filter per incoming inquiry. Each subscribes to ONLY its own
`email:<id>` facet on the Press Inbox gateway, judges whether the inquiry is a
genuine media / partnership / speaking opportunity, tags it with a kind + an
urgency, and exposes the qualified inquiry the opportunity register groups on.

This is the dark-lane seam: a PR blast / cold marketing email is judged
IRRELEVANT, so this filter leaves its `#### qualified` facet NULL. A NULL
qualified facet is a fixed, byte-identical token — it never moves — so an
irrelevant inquiry never wakes the opportunity register. The noise stays dark.

### Requires

- `email`: this filter's own inquiry slice, subscribed via the gateway's
  `email:<id>` facet ONLY. A delivery of a different inquiry moves a different
  facet, so this filter stays dark — it never wakes on a sibling's inquiry.

### Maintains

- `relevance`: this inquiry's relevance decision — whether it is a genuine
  opportunity, and if so its kind (`media` / `partnership` / `speaking`) and
  urgency (`normal` / `high`).
- immaterial: parse timestamps and the delivery revision counter.
- postcondition: an irrelevant PR blast is NEVER promoted into the register — it
  is filtered here, at the dark lane, by keeping `qualified` NULL.

#### qualified

Material: the qualified-inquiry slice the register groups on — its kind, urgency,
importance, the sender (owner-only PII), and the ask. This facet is the fingerprint
of ONLY that slice. For an IRRELEVANT inquiry the slice is `null` — a fixed NULL
token — so the facet stays dark and never wakes the register. The sender PII rides
in this owner-side slice; the projection that strips it happens downstream at the
briefing's `public` facet, never here.

### Continuity

- input-driven: a new or changed inquiry on this filter's own gateway facet wakes
  it. Re-delivering a byte-identical irrelevant blast leaves `qualified` NULL and
  unmoved — the register stays asleep.
