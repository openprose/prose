---
name: competitor-monitor
kind: responsibility
---

### Goal

A current, corroborated view of each tracked competitor's funding.

### Maintains

A corroborated view of each competitor's funding. Each competitor carries a
stable `name`; `fetched_at` and source request-ids are immaterial everywhere.
Postcondition: every funding event cites a corroborating source.

#### funding
Funding events per competitor — round, amount, date. Material: the event set
(unordered) and each event's round, amount, and date.

### Continuity

- self-driven: re-check on a daily forecast cadence.
