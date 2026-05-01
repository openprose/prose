---
name: map-reduce
kind: pattern
---

# Map-Reduce

Split input, delegate chunks to mappers in parallel, merge results with a reducer.

### Metadata

- `version`: 0.2.0
- `role`: coordinator

### Slots

- `mapper`
- `reducer`

### Config

- None. The instantiating system provides chunks and task inputs; the pattern defines only map/reduce coordination.

### Invariants

- Each input chunk is sent to exactly one mapper invocation
- Mappers run independently and do not see other chunks or mapper outputs
- The reducer receives every mapper output
- The final result is produced only by the reducer

### Shape

- `self`: partition input into chunks, fan out to mappers, collect results, delegate to reducer
- `delegates`:
  - `mapper`: process one chunk of the input
  - `reducer`: merge all mapper outputs into a single result
- `prohibited`: none

### Requires

- Pattern instance receives:
    mapper: string         -- service or system name for each mapper
    reducer: string        -- service or system name for the reducer
    task_brief: string     -- overall task description
    chunks: any[]          -- the pre-partitioned input chunks

### Ensures

- Each mapper receives one chunk and the overall task brief as context
- Mapper does not know other mappers exist or what chunks they received
- All mappers execute in parallel
- Reducer receives ALL mapper outputs and the overall task brief
- Reducer reasons about how to merge — handles conflicts and overlaps
- pattern_instance.result contains the merged output
- pattern_instance.mapper_results contains individual mapper outputs

### Delegation

```javascript
const { mapper, reducer, task_brief, chunks } = pattern_instance;

// Map phase — all mappers run in parallel
const mapperResults = await Promise.all(
  chunks.map((chunk, i) => {
    const mapBrief = `${task_brief}\n\nProcess this chunk (${i + 1} of ${chunks.length}):\n${typeof chunk === 'string' ? chunk : JSON.stringify(chunk)}`;
    return rlm(mapBrief, null, { use: mapper });
  })
);

// Reduce phase
const reduceBrief = `Merge these ${mapperResults.length} results into a single coherent output. Handle conflicts and overlaps.\n\nOverall task: ${task_brief}\n\nResults to merge:\n${mapperResults.map((r, i) => `--- Chunk ${i + 1} ---\n${r}`).join("\n\n")}`;
const merged = await rlm(reduceBrief, null, { use: reducer });

pattern_instance.result = merged;
pattern_instance.mapper_results = mapperResults;
return(merged);
```

### Notes

The instantiating system is responsible for partitioning the input into chunks before delegating to map-reduce. Mappers do not know other mappers exist. The reducer does not know it is part of a map-reduce pipeline.

Mappers run in parallel by default (`Promise.all`). For sequential execution (e.g., when mappers share rate-limited resources), replace `Promise.all` with a `for` loop — but this sacrifices the primary advantage of map-reduce.

Different from `fan-out`: map-reduce includes a reducer that merges results into a single output. Fan-out returns all results to the instantiating system, which decides how to use them.
