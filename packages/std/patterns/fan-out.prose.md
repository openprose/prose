---
name: fan-out
kind: pattern
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

### Requires

- Pattern instance receives:
    delegates: string[]     -- service or system names for each delegate
    briefs: string[]        -- one brief per delegate (same length as delegates)
                               OR a single string applied to all delegates

### Ensures

- Each delegate receives exactly one brief
- All delegates execute in parallel
- No delegate knows other delegates exist
- Results are returned as an ordered array matching the input delegates
- No merging or synthesis — the raw results are the output
- pattern_instance.result contains the array of all delegate outputs
- pattern_instance.results contains the same array (keyed alias)

### Delegation

```javascript
const { delegates, briefs, task_brief } = pattern_instance;

// Normalize briefs: single string broadcasts to all, array maps 1:1
const briefList = Array.isArray(briefs)
  ? briefs
  : delegates.map(() => briefs || task_brief);

// All delegates run in parallel
const results = await Promise.all(
  delegates.map((delegate, i) => {
    return rlm(briefList[i], null, { use: delegate });
  })
);

pattern_instance.result = results;
pattern_instance.results = results;
return(results);
```

### Notes

No delegate knows other delegates exist. Each receives a brief and returns a result. The fan-out pattern collects results but does not interpret them — interpretation is the instantiating system's responsibility.

Different from `map-reduce`: map-reduce includes a reducer that merges results into a single output. Fan-out returns the raw collection. Use fan-out when the instantiating system needs to see all results individually (e.g., to compare, to select, to present side-by-side). Use map-reduce when the goal is a single merged artifact.

Different from `race`: fan-out waits for ALL delegates. Race returns the FIRST acceptable result and cancels the rest.
