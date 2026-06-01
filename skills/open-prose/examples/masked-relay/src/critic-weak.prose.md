---
name: critic-weak
kind: responsibility
---

### Goal

Test the weakest and strangest claims across BOTH expanders' hypotheses — a
diamond fan-in over the expansion stage. Peer-blind toward the strong critic.

### Requires

- all expansion ledgers from `expander-1` and `expander-2` (a diamond fan-in,
  atomic)

### Maintains

A critic ledger in weak-case mode. Material: the critique and the count of claims
reviewed.

#### critique
The weak-case critique over the combined expansions, and `claims_reviewed`.

### Continuity

- input-driven: wake when either expansion ledger changes. Do NOT read the strong
  critic.
