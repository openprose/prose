---
name: signal-feeds
kind: gateway
version: 0.18.0
---

# Signal Feeds

> The monitor's upstream: one gateway that brings the three external competitor
> signals into the graph as three independently-subscribable facets. It has no
> `### Requires` (its input arrives from outside the graph), it `### Maintains`
> the latest normalized feed truth, and its `### Continuity` is
> **external-driven**, which is how Forme finds it as the DAG entry point. The
> facets are the point: a funding item moves only `#### funding-signals`, so
> the edge the monitor's funding need resolved to is the one that carries it.

### Continuity

- external-driven

### Schedule

- Every 6h, poll each configured feed; a webhook delivery may arrive at any
  time between polls.

### Receives

- Funding: press releases and filings — `competitor`, `round`, `amount`,
  `date`, `source`
- Hiring: job boards and careers pages — `competitor`, `department`, `role`,
  `posted_at`, `source`
- Launches: product and press feeds — `competitor`, `product`, `announced_at`,
  `ship_date`, `source`
- A delivery id or polling cursor — the dedupe / high-water key

### Maintains

The latest normalized feed items, keyed by `competitor_id` — the raw signals the
monitor corroborates into its standing view. Delivery ids, polling cursors, and
`fetched_at` are immaterial everywhere; a re-poll that returns the same items
moves no facet, so the monitor memo-skips and the cost meter stays flat. Each
`####` part below is a facet: its name is the fingerprint unit, the subscription
symbol the monitor names in `### Requires`, and the `published/<facet>/…`
subtree.

#### funding-signals

Funding events per competitor as reported by the feeds. Material: the event set
(unordered) and each event's round, amount, date, and source. The monitor's
`funding-signals` need resolves here.

#### hiring-signals

Open roles per competitor as reported by the feeds. Material: the posting set
(unordered) and each posting's department, role, and source; `posted_at` is
material only to the day. The monitor's `hiring-signals` need resolves here.

#### launch-signals

Announced or shipped products per competitor as reported by the feeds.
Material: the launch set (unordered) and each launch's product, announced date,
ship date, and source. The monitor's `launch-signals` need resolves here.

### Emits

- competitor-activity-monitor

### Payload

Pass the new or changed feed items grouped by signal kind, each with its source
URL, as the incoming truth. A full poll page and a single webhook delivery are
both valid shapes.
