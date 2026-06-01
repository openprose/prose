---
name: outreach-packet
kind: responsibility
---

# Outreach Packet

> A **per-stargazer** responsibility (`outreach-packet[user]`) that assembles a
> human-review-ready note around the execution-backed sample result. It is the
> **hard human gate**: it drafts and packages, and it **never auto-sends**. The
> only path to `sent_by_human` runs through a real human action at the
> `human-review-events` gateway.

### Requires

- This user's `intent-safety-scorer` truth (atomic facet).
- This user's `sample-program-builder` truth (atomic facet) — the sample result
  the note is built around.
- The `human-review-events` gateway truth (atomic facet) — the only thing that can
  advance the packet past review.

### Maintains

The outreach packet, as this responsibility's maintained truth (read by
reference, postconditions self-policed, no separate judge beat):

- `note`, `sample_result_summary`, `human_review_checklist`.
- `auto_send`: **always `false`** — the load-bearing safety invariant. The system
  drafts and packages; it does not send.
- `status`:
  - `ready_for_review` when a sample exists and the human has not yet acted —
    the packet **stops here**;
  - `blocked` when no qualifying sample exists;
  - `sent_by_human` **only** after the human marks it sent via the review gateway;
  - `archived` when the human suppresses the stargazer.

This is a facet-less producer exposing the single **atomic facet** (the exported
`ATOMIC_FACET` constant, never `"*"`).

### Continuity

input-driven: re-renders when the claims audit, sample result, or review ledger
changes. Wake only when a sample result exists; never auto-send. A packet that has
reached `ready_for_review` and seen no human action since memo-**skips** on the
next quiet re-poll — it does not drift, and it does not send itself.
