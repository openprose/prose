---
name: opportunity-register
kind: responsibility
---

# Opportunity Register

The fan-in. Subscribes to every relevance filter's `qualified` facet, keeps ONLY
the qualified inquiries, and groups them by KIND into a live opportunity register.
It exposes one facet per kind, so a move in one kind wakes the briefing for that
kind alone.

A filter whose `qualified` facet is NULL (an irrelevant PR blast) never moves the
subscription, so the register simply never sees the noise — it groups over the
genuine opportunities only.

### Requires

- `opportunities`: every relevance filter's `qualified` slice (the fan-in),
  subscribed via each filter's `qualified` facet ONLY. The register reads all of
  them by reference and groups by kind.

### Maintains

- `register`: the current opportunity register, grouped by kind. The `####` facets
  below are the per-kind subscription symbols — each is the fingerprint of ONLY
  that kind's grouped slice. Each register entry keeps the sender (owner-only PII)
  and the ask in a PRIVATE workspace field — that PII is stripped from every public
  projection downstream.
- immaterial: per-kind entry ordering jitter that does not change the grouped
  material.
- postcondition: an irrelevant inquiry is never present in the register; the
  register only ever carries genuine, qualified opportunities.

#### media

Material: the grouped media / press opportunities (interview + feature requests).

#### partnership

Material: the grouped partnership opportunities (co-marketing, integration,
strategic, acquisition).

#### speaking

Material: the grouped speaking opportunities (conference + panel invitations).

### Continuity

- input-driven: a relevance filter whose `qualified` slice moved wakes the
  register. A dark (NULL) filter propagates nothing, so the register re-groups
  over the qualified opportunities only.
