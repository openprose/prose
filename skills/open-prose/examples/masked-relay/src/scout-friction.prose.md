---
name: scout-friction
kind: responsibility
---

### Goal

Inspect the canonical signal ledger through ONE lens — workflow friction — and
emit its own claims. Peer-blind: it never reads the price or desire scouts.

### Requires

- the current signal ledger from `signal-ledger` (atomic)

### Maintains

A workflow-friction scout ledger. Material: the claims and their evidence refs.

#### claims
Each claim carries a `claim_id`, the `persona`, an `evidence_ref` back to a ledger
row, and a `confidence`. The claim set is this scout's whole exposed truth.

### Continuity

- input-driven: wake when the signal ledger changes. Do NOT read sibling scouts.
