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
- `result`: the merged output
- `mapper_results`: individual mapper outputs

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
