---
name: dedupe
kind: service
---

# Dedupe

### Description

Consolidates confirmed findings that share a root cause into one finding with
a stable dedupe group id, so a single underlying bug reachable from many
entry points is reported once.

### Requires

- `findings`: disprove verdicts for this round's candidates

### Ensures

- `findings`: confirmed findings, each with a stable `dedupe_group` id;
  findings sharing a root cause are merged into one, listing every entry point
- refuted and unreproducible candidates are carried through unmerged with their
  verdict preserved, never dropped

### Shape

- `self`: cluster findings by root cause, assign stable group ids, merge
- `prohibited`: discarding refuted or unreproducible candidates; merging
  findings that only look similar but have distinct root causes

### Strategies

- merge on shared root cause, not on shared symptom or shared file
- a dedupe group id must be stable across rounds and runs so the ledger can
  track the same bug over time
- when in doubt about whether two findings share a root cause, keep them
  separate and note the suspected relationship
