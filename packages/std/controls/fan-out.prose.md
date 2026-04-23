---
name: fan-out
kind: composite
---

# Fan-Out

Parallel delegation without reduction. Send briefs to N delegates, collect all results. The parent decides how to use them.

### Metadata

- `version`: 0.1.0
- `role`: coordinator

### Runtime

- `state.reads`: &controlState
- `state.writes`: &controlState

### Slots

- `delegates`

### Shape

- `self`: dispatch briefs to delegates in parallel, collect all results, return collection
- `delegates`:
  - `delegate_1..delegate_N`: execute assigned brief
- `prohibited`: merging or synthesizing results — that is the parent's job

### Requires

- &controlState exists at __controlState with:
    delegates: string[]     -- component names for each delegate
    briefs: string[]        -- one brief per delegate (same length as delegates)
                               OR a single string applied to all delegates

### Ensures

- Each delegate receives exactly one brief
- All delegates execute in parallel
- No delegate knows other delegates exist
- Results are returned as an ordered array matching the input delegates
- No merging or synthesis — the raw results are the output
- &controlState.result contains the array of all delegate outputs
- &controlState.results contains the same array (keyed alias)

### Delegation

```javascript
const { delegates, briefs, task_brief } = __controlState;

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

__controlState.result = results;
__controlState.results = results;
return(results);
```

### Notes

No delegate knows other delegates exist. Each receives a brief and returns a result. The fan-out control collects results but does not interpret them — interpretation is the parent's responsibility.

Different from `map-reduce`: map-reduce includes a reducer that merges results into a single output. Fan-out returns the raw collection. Use fan-out when the parent needs to see all results individually (e.g., to compare, to select, to present side-by-side). Use map-reduce when the goal is a single merged artifact.

Different from `race`: fan-out waits for ALL delegates. Race returns the FIRST acceptable result and cancels the rest.
