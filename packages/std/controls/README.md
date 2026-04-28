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

Controls are delegation coordinators. Each one is a typed pattern contract: it
accepts a `control_state` JSON input and returns a `control_result` JSON output.
The contract describes the reusable flow shape. Controls are executable as
agent-facing contracts and registry-visible composition patterns. Deterministic
native graph execution uses an explicit `### Execution` block with concrete
`call`, `parallel`, and `return` steps.

## When to Use a Control vs. an Explicit Execution Block

Use a **control** when the delegation pattern is structural — you want pipeline sequencing, parallel fan-out, or retry logic, and the pattern is reusable across different component compositions. Controls encode the *shape* of delegation without knowing the *content*.

Write an **explicit execution block** (`let` + `call`) when the logic is specific to your program — conditional branching based on intermediate results, custom error recovery, or orchestration that doesn't fit a standard pattern. If you find yourself fighting a control to get custom behavior, drop to an execution block.

Rule of thumb: if the delegation logic is about *flow* (sequence, parallel, retry, gate), use a control. If it's about *decisions* (inspect this result, choose that path), use an execution block.

## The `control_state` Convention

Every control reads one JSON object and returns one JSON object:

- **Input:** `control_state` declares component names, briefs, thresholds,
  budgets, chunks, or candidate lists.
- **Output:** `control_result` contains the result plus metadata such as scores,
  attempts, failure history, or selected winners.
- **Runtime status:** variable-width fan-out, race cancellation, dynamic retry,
  and fallback scheduling are pattern semantics until native control IR grows
  first-class support for them.

The state object is the control's entire world. It does not imply hidden global
state, shared mutable memory, or JavaScript runtime hooks.

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

## Native Runtime Support

Supported:

- fixed service calls through explicit `### Execution` blocks
- fixed `parallel:` groups in execution IR
- package-local composite references for documented topology expansion
- scripted Pi execution of a control contract as a single graph node

Pattern contracts:

- variable-width fan-out
- dynamic map-reduce partitioning
- first-winner race cancellation
- retry loops with live attempt resumption
- fallback chains with dynamic delegate failure handling

## Candidate Additional Pattern

- **accumulator** — Streaming aggregation: process items one at a time, maintaining a running aggregate that grows with each item. Different from map-reduce (no final merge step — the aggregate *is* the result) and pipeline (items don't transform through stages — they contribute to a single evolving state).
