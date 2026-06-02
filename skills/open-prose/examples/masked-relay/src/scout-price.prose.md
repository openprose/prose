---
name: scout-price
kind: responsibility
---

### Goal

Inspect the canonical signal ledger through ONE lens — price anxiety — and emit
its own claims. It is peer-blind: it never reads the friction or desire scouts,
so the three personas cannot collapse into premature consensus.

### Requires

- the current signal ledger from `signal-ledger` (atomic)

### Maintains

A price-anxiety scout ledger. Material: the claims and their evidence refs.

#### claims
Each claim carries a `claim_id`, the `persona`, an `evidence_ref` back to a ledger
row, and a `confidence`. The claim set is this scout's whole exposed truth.

### Continuity

- input-driven: wake when the signal ledger changes. Do NOT read sibling scouts —
  peer blindness is the property this fan-out teaches.
