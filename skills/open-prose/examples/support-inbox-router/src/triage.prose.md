---
name: triage
kind: responsibility
---

# Triage

One triage per inbound email — THE CHEAP SPAM/CONTENT FILTER + ROUTER TAG. Each
subscribes to ONLY its own `email:<id>` facet on the Support Inbox gateway. It
decides **spam | ham**; for ham it assigns a CHANNEL in
`{bug, feature, docs, billing}` and carries the canonical `{subject, body}`
through VERBATIM.

This is the cheap spam gate: it is the only spend on junk. A spam email leaves
its `#### routed` facet UNMOVED (NULL), so it wakes NOTHING downstream — the
router is not even woken. Cost scales with surprise; the cheap filter is the
whole bill for a junk email.

### Requires

- `email`: this triage's own email slice, subscribed via the gateway's
  `email:<id>` facet ONLY. A delivery to a different message moves a different
  facet, so this triage stays dark — it never wakes on a sibling's email.

### Maintains

- `decision`: `spam` or `ham`. A spam decision populates no routed slice.
- immaterial: the sender address and the delivery revision counter — a duplicate
  question from a different sender, with byte-identical canonical content, leaves
  `#### routed` still.

#### routed

Material: the routed slice `{channel, canonical content}` the router catalogues —
present ONLY for ham, and the canonical `{subject, body}` is carried through
VERBATIM. **NULL when spam** (the fixed empty token): a spam email's `routed`
facet never moves, so it wakes no router and no channel. This is the spam
boundary.

### Continuity

- input-driven: a new or changed email on this triage's own gateway facet wakes
  it. A re-delivery whose canonical content is unchanged leaves `#### routed`
  still and dedup-skips downstream.

### Runtime

- model: `anthropic/claude-haiku-4-5` — the CHEAP classifier role. Spam-gating
  and routing are a small, cheap decision; the smart models live downstream (or
  in the judge). The deterministic offline fixture stands in a pure fake; the
  live tier-3 test drives this seam with the cheap model and an LLM judge.
