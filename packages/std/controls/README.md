---
purpose: Flow control patterns for Prose programs — 8 patterns describing how work is sequenced, distributed, guarded, retried, or raced across single or multiple agents; complements composites (topology) with execution flow
related:
  - ../README.md
  - ../composites/README.md
  - ../roles/README.md
  - ../../programs/README.md
---

# lib/controls

Flow control patterns used to structure Prose program execution.

Controls are delegation coordinators. Each one takes a `__controlState` object that specifies which components to delegate to and how. The control manages the delegation loop — dispatching briefs, collecting results, tracking state — so the parent program doesn't have to.

## When to Use a Control vs. an Explicit Execution Block

Use a **control** when the delegation pattern is structural — you want pipeline sequencing, parallel fan-out, or retry logic, and the pattern is reusable across different component compositions. Controls encode the *shape* of delegation without knowing the *content*.

Write an **explicit execution block** (`let` + `call`) when the logic is specific to your program — conditional branching based on intermediate results, custom error recovery, or orchestration that doesn't fit a standard pattern. If you find yourself fighting a control to get custom behavior, drop to an execution block.

Rule of thumb: if the delegation logic is about *flow* (sequence, parallel, retry, gate), use a control. If it's about *decisions* (inspect this result, choose that path), use an execution block.

## The `__controlState` Convention

Every control reads and writes a `__controlState` object. This is the control's interface to its parent:

- **Input:** The parent populates `__controlState` with the control's `requires` fields — component names, briefs, configuration.
- **Output:** The control writes results back to `__controlState` — the final result, metadata (scores, attempt counts, failure history), and any intermediate data.
- **During execution:** The control uses `__controlState` for internal bookkeeping (e.g., `_lastSuggestions` in refine). Fields prefixed with `_` are private to the control.

The `__controlState` object is the control's entire world. It does not read from or write to any other shared state.

## Controls

| Control | Slots | Pattern |
|---|---|---|
| **pipeline** | stages[] | Sequential transformation chain — each stage's output feeds the next |
| **map-reduce** | mapper, reducer | Split input, delegate chunks in parallel, merge with a reducer |
| **guard** | guard, target | Check precondition, fail-fast if unmet — binary pass/block |
| **refine** | refiner, evaluator | Iteratively improve to a quality threshold (0..1 scoring) |
| **retry-with-learning** | target | Retry with accumulated failure analysis between attempts |
| **fan-out** | delegates[] | Parallel delegation without reduction — parent uses raw results |
| **race** | candidates[] | Parallel speculative execution — first acceptable result wins |
| **fallback-chain** | chain[] | Sequential failover — try A, if it fails try B, then C |

## Decision Matrix

| You need to... | Use |
|---|---|
| Transform data through ordered stages | **pipeline** |
| Process chunks independently then merge | **map-reduce** |
| Check a precondition before expensive work | **guard** |
| Improve a mediocre result iteratively | **refine** |
| Recover from failure with enriched retries | **retry-with-learning** |
| Get results from N delegates without merging | **fan-out** |
| Try multiple approaches, take the first win | **race** |
| Try preferred delegate, fall back on failure | **fallback-chain** |

### Distinguishing Similar Controls

**fan-out vs. map-reduce:** Both run delegates in parallel. Map-reduce includes a reducer that produces a single merged artifact. Fan-out returns the raw collection for the parent to interpret.

**race vs. fan-out:** Both run delegates in parallel. Fan-out waits for all and returns everything. Race returns the first acceptable result.

**race vs. fallback-chain:** Both try multiple candidates. Race tries all simultaneously. Fallback-chain tries sequentially, only advancing on failure. Use race when parallelism is cheap. Use fallback-chain when later candidates are expensive.

**retry-with-learning vs. fallback-chain:** Both handle failure. Retry retries the SAME component with enriched context. Fallback-chain tries DIFFERENT components with the original brief.

**retry-with-learning vs. refine:** Both iterate. Retry recovers from failure (broken results). Refine improves mediocrity (working but insufficient results).

## Future Work

- **accumulator** — Streaming aggregation: process items one at a time, maintaining a running aggregate that grows with each item. Different from map-reduce (no final merge step — the aggregate *is* the result) and pipeline (items don't transform through stages — they contribute to a single evolving state).
