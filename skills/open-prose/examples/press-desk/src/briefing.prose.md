---
name: briefing
kind: responsibility
---

# Leadership Briefing

The terminal fan-in. Assembles a leadership brief from the opportunity register,
faceted by kind. This is where this example's two load-bearing mechanisms live —
a deterministic HUMAN GATE and a PRIVACY PROJECTION.

### Requires

- `register`: the opportunity register, subscribed via each of its per-kind facets
  (`media`, `partnership`, `speaking`). A move in one kind wakes the briefing for
  that kind.

### Maintains

- `briefing`: the shipped leadership brief — its status, the owner-only full view,
  and a public projection.
- `auto_reply`: **always `false`** — the load-bearing safety invariant. The press
  desk drafts and packages; it NEVER auto-replies to an inquiry.
- `status`:
  - `ready` when every qualified inquiry is normal-importance — the brief is
    assembled and a human may act at leisure;
  - `needs_human` when ANY qualified inquiry is HIGH importance — the brief
    **stops here** at the human gate. The render commits the register update, but
    the OUTWARD action (a reply) is refused to the system and reserved for a human.
    This is the gateCommit: maintain truth, refuse the action.
- immaterial: assembly timestamps.
- postcondition: a high-importance inquiry NEVER produces an auto-reply; the brief
  stops at `needs_human` and a human owns the outward action.

#### public

Material: the masked public projection of the brief — for each opportunity its
kind, importance, urgency, and ask, plus the brief status. The sender name and
sender email are STRIPPED by construction: they live ONLY in the owner-only view
and never enter this facet. A downstream public consumer subscribes to THIS facet
ONLY and so can never see the raw sender PII. The public view announces the gate
(`gated: true`) without leaking WHO triggered it.

### Continuity

- input-driven: a per-kind register facet moving wakes the briefing. A quiet
  re-wake (nothing moved) memo-skips at zero fresh.
- self-driven: a periodic self-tick re-checks the shipped brief; when its inputs
  have not moved it records a `self` skip that lights no edge and costs nothing
  (the audit floor). A brief that has reached `needs_human` and seen no human
  action **skips** on the next quiet re-poll — it does not drift, and it does not
  reply by itself.

### Invariants

- `auto_reply` is always `false`. The only path by which an outward reply is ever
  sent is a human clearing the `needs_human` gate.
- No sender PII (name or email) ever appears in the `public` projection.
