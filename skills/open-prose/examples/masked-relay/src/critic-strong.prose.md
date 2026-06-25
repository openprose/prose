---
name: critic-strong
kind: responsibility
version: 0.15.0
---

### Goal

Test the strongest case across BOTH expanders' hypotheses — a diamond fan-in over
the expansion stage. Peer-blind toward the weak critic.

### Requires

- all expansion ledgers from `expander-1` and `expander-2` (a diamond fan-in,
  atomic)

### Maintains

A critic ledger in strong-case mode. Material: the critique and the count of
claims reviewed.

#### critique
The strong-case critique over the combined expansions, and `claims_reviewed`.

### Continuity

- input-driven: wake when either expansion ledger changes. Do NOT read the weak
  critic.
