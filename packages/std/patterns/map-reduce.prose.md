---
name: map-reduce
kind: pattern
version: 0.15.0
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

### Parameters

- Pattern instance receives:
    mapper: string         -- function or responsibility name for each mapper
    reducer: string        -- function or responsibility name for the reducer
    task_brief: string     -- overall task description
    chunks: any[]          -- the pre-partitioned input chunks

### Returns

- `result`: the merged output, produced solely by the reducer after it reasons about how to merge — handling conflicts and overlaps — over ALL mapper outputs and the overall task brief.
- `mapper_results`: the individual mapper outputs, one per chunk, each mapper having received its single chunk and the overall task brief as context, run in parallel, with no mapper aware of the others or their chunks.

### Delegation

```prose
let mapper_results = parallel for chunk, index in chunks:
  call mapper
    task_brief: task_brief
    chunk: chunk
    chunk_index: index
    chunk_count: chunks.length

let result = call reducer
  task_brief: task_brief
  mapper_results: mapper_results
  prompt: "Merge every mapper result, preserving conflicts and resolving overlap explicitly."

return {
  result: result,
  mapper_results: mapper_results
}
```

### Notes

The instantiating system is responsible for partitioning the input into chunks before delegating to map-reduce. Mappers do not know other mappers exist. The reducer does not know it is part of a map-reduce pipeline.

Mappers run in parallel by default (`Promise.all`). For sequential execution (e.g., when mappers share rate-limited resources), replace `Promise.all` with a `for` loop — but this sacrifices the primary advantage of map-reduce.

Different from `fan-out`: map-reduce includes a reducer that merges results into a single output. Fan-out returns all results to the instantiating system, which decides how to use them.
