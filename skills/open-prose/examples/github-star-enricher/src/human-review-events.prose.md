---
name: human-review-events
kind: gateway
---

# Human Review Events

> The second external entry point — the **human gate's** ingress. The owner
> reviews, edits, sends, or suppresses a drafted outreach packet, and that action
> enters the graph here. It has no `### Requires`; it `### Maintains` the
> review-ledger truth that the `registry` and every `outreach-packet` subscribe
> to; its `### Continuity` is **external-driven**.

### Continuity: external-driven

The system never sends outreach on its own. A packet only advances past
`ready_for_review` when a *human* acts — and that action arrives as an external
receipt at this gateway. A quiet world (no review action) leaves this truth
unmoved, so it memo-skips and wakes nothing.

### Receives

- `approve`, `edit`, `send_mark` — the owner moves a packet forward.
- `reply_received` — an inbound reply is recorded.
- `suppress_user`, `suppress_company` — never contact this entity again.

### Maintains

The review ledger, keyed by stargazer login:

- `per_user_action`: `null` until the owner acts, then `approve | sent | suppress`.
- `suppressed_users`, `suppressed_companies`: the do-not-contact sets the
  registry consults when deciding eligibility.

This is a facet-less producer: it exposes its whole truth as the single **atomic
facet** (the exported `ATOMIC_FACET` constant, never `"*"`). When a `sent` mark
appears for a user, that user's `outreach-packet` re-renders to `sent_by_human` —
the ONLY path by which a packet is ever marked sent.
