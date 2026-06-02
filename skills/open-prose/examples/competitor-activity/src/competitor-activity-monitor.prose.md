---
name: competitor-activity-monitor
kind: responsibility
id: 067NC4KG01RG50R40M30E20918
---

# Competitor Activity Monitor

> The canonical named-parts (facet) example. A mounted DAG node that maintains a
> standing, corroborated view of each tracked competitor and declares three
> independently-subscribable facets — `#### funding`, `#### hiring`, and
> `#### product-launches` — so a downstream that watches funding wakes only when
> funding moves, not when hiring or launches move. This is React's selector
> boundary made authorable (`architecture.md` §3.2, the named-parts rule).

### Goal

A current, corroborated view of each tracked competitor's material activity.

### Requires

Subscription contracts — Forme matches each entry to a producing node's
`### Maintains` facet (`Requires.<facet> ↔ Maintains.<facet>`), and run time
follows the resolved input-fingerprint tuple.

- `funding-signals`: a current view of competitor funding events.
  *(A funding feed/gateway maintains this.)*
- `hiring-signals`: a current view of competitor hiring activity.
  *(A hiring/jobs feed maintains this.)*
- `launch-signals`: a current view of announced or shipped competitor products.
  *(A product/press feed maintains this.)*

### Maintains

The world-model schema — the *shape* of the standing truth this node commits.
A current, corroborated view of each tracked competitor, keyed by `competitor_id`.
Each competitor carries a stable `name` and a `last_corroborated` field;
`fetched_at` and source request-ids are immaterial everywhere. Entries are
ordered by `competitor_id` before hashing so map-ordering noise is not a change.

The subscribable parts of the truth are the three `####` facets below. Each
`####` part *is* a facet: its name is at once the **fingerprint unit** (the
compiled canonicalizer emits one token per part, plus the always-on `@atomic`
token over the whole truth), the **subscription symbol**
(`Requires.<facet>` ↔ `Maintains.<facet>`), and the **`published/<facet>/…`
subtree** of the world-model directory. The shared `name` and `last_corroborated`
sit outside any part, so they move only the `@atomic` token. Declaring no parts
at all would be the atomic default; here we name three.

#### funding

Funding events per competitor — round, amount, date. Material: the event set
(unordered) and each event's round / amount / date. A downstream that
`### Requires` *funding* wakes only when this part's fingerprint moves.

#### hiring

Open-role activity per competitor. Material: the department set (unordered) and
the open-role count (exact). A hiring-watcher subscribes here and does not wake
on funding or launch moves.

#### product-launches

Announced or shipped products per competitor. Material: the launch set
(unordered); a ship-date slipping past today flips each launch's `shipped`
status, which is material — so "time becoming material" propagates as an ordinary
fingerprint move (`world-model.md` §6).

**Postconditions** (self-policed by the render before it signs — no separate
judge beat):

- Every listed competitor cites at least one corroborating source.
- A funding/hiring/launch event appears only after corroboration; uncorroborated
  rumor is held out of the material set.

### Continuity

- **input-driven** (default): a new `funding-signals`, `hiring-signals`, or
  `launch-signals` receipt whose subscribed facet fingerprint moved wakes the
  matching part of this node.
- **self-driven**: re-check every 6h so a launch ship-date silently lapsing flips
  the affected `#### product-launches` fingerprint and propagates as surprise.

### Invariants

- A material event is never recorded without at least one corroborating source.
- Facet boundaries are stable: a funding event never moves the hiring fingerprint.

### Shape

- `self`: weigh signal corroboration, deduplicate events across sources, and
  carry the prior corroborated truth forward.
- `prohibited`: inventing events, amounts, dates, or sources absent from the
  subscribed inputs or the prior world-model.

### Runtime

- `persist`: project
