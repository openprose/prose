---
name: fan-out
kind: pattern
version: 0.15.0
---

# Fan-Out

Parallel delegation without reduction. Send briefs to N delegates, collect all results. The instantiating system decides how to use them.

### Metadata

- `version`: 0.1.0
- `role`: coordinator

### Slots

- `delegates`

### Config

- None. The instantiating system supplies delegate bindings with `with:` and briefs as system inputs.

### Invariants

- Each delegate receives exactly one brief
- Delegates remain independent and do not see each other's outputs
- Result order matches the order of the `delegates` slot instances
- The pattern never merges, ranks, or synthesizes delegate outputs

### Shape

- `self`: dispatch briefs to delegates in parallel, collect all results, return collection
- `delegates`:
  - `delegate_1..delegate_N`: execute assigned brief
- `prohibited`: merging or synthesizing results — that is the instantiating system's job

### Parameters

- Pattern instance receives:
    delegates: string[]     -- responsibility or function names for each delegate
    briefs: string[]        -- one brief per delegate (same length as delegates)
                               OR a single string applied to all delegates

### Returns

- `result`: array of all delegate outputs, in order matching the input delegates
- `results`: same array, provided as a keyed alias

The returned collection contains exactly one result per delegate, each from a delegate that received exactly one brief, ran in parallel, and saw no other delegate's output. The raw results are the output: the pattern returns them unmerged and unsynthesized.

### Delegation

```prose
let results = parallel for delegate, index in delegates:
  call delegate
    brief: briefs[index]
    fallback_brief: task_brief

return {
  result: results,
  results: results
}
```

### Notes

No delegate knows other delegates exist. Each receives a brief and returns a result. The fan-out pattern collects results but does not interpret them — interpretation is the instantiating system's responsibility.

Different from `map-reduce`: map-reduce includes a reducer that merges results into a single output. Fan-out returns the raw collection. Use fan-out when the instantiating system needs to see all results individually (e.g., to compare, to select, to present side-by-side). Use map-reduce when the goal is a single merged artifact.

Different from `race`: fan-out waits for ALL delegates. Race returns the FIRST acceptable result and cancels the rest.
