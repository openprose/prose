# RFC 014 Implementation Phases

This phase tree is implementation order, not just document order.

## Recommended Sequence

1. `02-pi-first-runtime-backpressure`
   - Remove old runtime vocabulary first.
   - Establish Pi as the reactive graph VM.
   - Add the node prompt envelope, structured output tool, telemetry, and
     pre-session gates.
2. `01-example-ladder-and-fixtures`
   - Add fixtures, eval rubrics, and scripted Pi test helpers after the runtime
     seams are correct.
3. `03-simple-company-graphs`
   - Add the first real examples and selective recompute measurements.
4. `04-reactive-company-loops`
   - Add memory/idempotence/replay pressure.
5. `05-gated-and-mutating-workflows`
   - Add human gates and controlled scratch mutation.
6. `06-measurement-and-release-gates`
   - Make examples part of release confidence.
7. `07-reference-company-sync`
   - Feed proven patterns back into the reference company package.

## Implementation Discipline

Each slice must include:

- code or docs change
- focused test
- broader test command where feasible
- signpost
- commit
- push

If a slice intentionally breaks old provider tests while deleting obsolete
architecture, the signpost must say which replacement tests restore coverage in
the next slice.
