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

Every slice must be treated as a checkpoint. Do not batch multiple slices into
one large commit unless the earlier slice is impossible to verify on its own.

### Per-Slice Checklist

1. Re-read the current phase README and implementation guide.
2. State the slice being started in the working notes or signpost draft.
3. Make the smallest coherent code/docs change for that slice.
4. Run the focused tests named by the slice.
5. Run broader backpressure:
   - `bun run typecheck`
   - `bun test` when feasible
   - any package/confidence command named by the slice
6. Add a signpost in `rfcs/014-company-example-backpressure/signposts/`.
7. Commit with the slice message or a narrower message.
8. Push the branch.
9. Begin the next slice only after the repository is clean.

If a slice intentionally breaks old provider tests while deleting obsolete
architecture, the signpost must say which replacement tests restore coverage in
the next slice.
