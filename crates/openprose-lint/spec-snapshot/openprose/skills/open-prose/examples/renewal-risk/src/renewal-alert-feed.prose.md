---
name: renewal-alert-feed
kind: responsibility
version: 0.15.0
---

# Renewal Alert Feed

### Goal

The account team sees a current, deduplicated feed of the accounts that need
attention now — only the accounts whose *risk verdict* actually moved, never the
quiet ones and never on cosmetic churn.

### Requires

- `accounts.risk`: this responsibility subscribes to the `renewal-risk`
  responsibility's `risk` facet **only** — never to `history`. It wakes when a
  live risk verdict moves and stays dark when only the append-only decision
  history grows. A non-material re-judgement (signals nudged, classification
  unchanged) leaves the `risk` facet byte-identical, so this node writes a
  `skipped` receipt and spawns nothing.

### Maintains

- `alerts`: the current set of accounts flagged for owner action, each with the
  risk level, the cited cause, the next action, and the owner to page. Ordered
  by urgency.
- immaterial everywhere: render timestamps and the upstream wake ref.
- postcondition: every alert names an owner and a next action (it inherits the
  upstream postcondition; it never raises an alert without one).

### Continuity

- input-driven: a moved `risk` facet on `renewal-risk` wakes this feed.

### Invariants

- Do not page an owner for an account whose verdict did not change.
- Do not surface private account detail beyond the owning team.

### Execution

```prose
let risk = read_subscription("renewal-risk", "risk")

let alerts = call rank-alerts
  risk: risk

return { alerts: alerts }
```
