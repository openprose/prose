---
name: insight-synthesizer
kind: responsibility
---

### Goal

Commit the weekly non-obvious customer-insight memo. Unlike every masked stage
upstream, the synthesizer has FULL PROVENANCE: it sees the complete receipt trail
— all scouts, all expansions, all critiques — before it changes the memo, and it
names which upstream receipts moved.

### Requires

- all scout ledgers from `scout-price`, `scout-friction`, `scout-desire` (atomic)
- all expansion ledgers from `expander-1`, `expander-2` (atomic)
- all critic ledgers from `critic-strong`, `critic-weak` (atomic)

### Maintains

The `InsightMemo`. Material: the headline, evidence refs, minority threads, best
objection, recommended probe, and what changed since last.

#### memo
The current non-obvious insight, its receipt-linked evidence, and
`changed_since_last` — the explanation of which upstream receipts caused the
change (read off the wake's input fingerprints, never invented).

### Continuity

- input-driven: wake when any subscribed ledger receipt materially changes. Reuse
  the prior memo unchanged if the input receipt set is unchanged — an unmoved
  input set writes a `skipped` receipt and spends zero fresh.
