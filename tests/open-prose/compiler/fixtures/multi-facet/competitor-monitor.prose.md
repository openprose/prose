---
name: competitor-monitor
kind: responsibility
version: 0.15.0
id: 067NC4KG01RG50R40M30E2FACE7
---

# Competitor Activity Monitor

### Goal

A current, corroborated view of each tracked competitor's funding, hiring, and
product activity is maintained.

### Continuity

- The competitor view is polled on a daily cadence.

### Maintains

A current, corroborated view of each tracked competitor. Each competitor carries
a stable `name` and a `last_corroborated` field. `fetched_at` and source
request-ids are immaterial everywhere.

#### funding

Funding events per competitor — round, amount, date. Material: the event set
(unordered) and each event's `round`, `amount`, and `date`.

#### hiring

Open-role activity. Material: the `departments` set and the `open_roles` count
(exact).

#### product-launches

Announced or shipped products. Material: the `launches` set; a ship-date
slipping past today flips `shipped`, which is material.

### Criteria

- Every competitor cites a corroborating source.

### Tools

(none)
