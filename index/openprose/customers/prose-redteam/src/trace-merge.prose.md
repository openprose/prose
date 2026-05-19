---
name: trace-merge
kind: service
---

# Trace Merge

### Description

Reducer. Merges the per-finding reachability verdicts from a round's parallel
trace fan-out into one reachability result the ledger can absorb.

### Requires

- `traced`: the list of per-finding trace outputs from this round

### Ensures

- `reachability`: the merged set of findings with reachability verdicts,
  preserving each finding's verdict, path, and preconditions, and grouping by
  `dedupe_group`

### Shape

- `self`: collate per-finding trace outputs into one ordered, grouped result
- `prohibited`: changing any individual reachability verdict; dropping any
  traced finding

### Strategies

- this is a pure collation step: never re-judge reachability here
- preserve input order and `dedupe_group` grouping so coverage stays stable
  round to round
