---
name: signals
kind: gateway
version: 0.15.0
---

# Product Signal Inbox

> The gateway for the lightweight product-signal stream — customer notes, support
> pain, usage anomalies, roadmap items, competitor moves, founder hunches. It has
> no `### Requires` (its input arrives from outside the graph), it `### Maintains`
> the latest incoming signal bundle as the truth the Signal Ledger subscribes to,
> and its `### Continuity` is **external-driven**, which is how Forme finds it as a
> DAG entry point.

### Continuity: external-driven

A webhook, a manual paste, or a scheduled poll translates into a *receipt* at the
edge of the system — one wake event type, an external source. The gateway turns
that trigger into the normalized signal bundle the downstream Signal Ledger
dedupes.

Because this node is external-driven, it is an **entry point**: a wake enters the
graph here. An entry node memo-keys on `(contract_fingerprint, input_fingerprints)`
and an entry node has no inputs, so a re-wake carrying a byte-identical delivery
is a memo **HIT**: the gateway memo-**skips**, and a skip propagates nothing, so
nothing downstream wakes. A genuinely new delivery moves the entry node's memo
key — that is how fresh external truth enters. The lesson is the marquee one:
cost scales with surprise, not with how often you poll.

### Receives

- `customer_note`, `support_pain`, `usage_anomaly`, `roadmap_item`,
  `competitor_move`, `founder_hunch` — the raw product signals.
- Provider: any upstream feed, form, or webhook the harness wires to this entry.

### Maintains

The latest incoming signal bundle, as the structured truth the Signal Ledger
subscribes to:

- `anomalies`: the list of raw signals, each `{ id, note, weirdness }`.
- `epoch`: a monotone marker of which delivery produced this truth.

This is a facet-less producer: it exposes its whole maintained truth as the single
**atomic facet** (the exported `ATOMIC_FACET` constant — never a `"*"` wildcard,
which would silently never propagate).

A render reads its prior truth **by reference** (it does not re-fetch the world);
it self-polices these postconditions before signing its receipt — there is **no
separate judge beat**.

### Emits

- signal-ledger

When this gateway's atomic facet moves, Forme wakes the Signal Ledger.
