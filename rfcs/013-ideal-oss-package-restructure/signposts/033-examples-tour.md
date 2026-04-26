# 033: Examples Capability Tour

**Date:** 2026-04-26
**Phase:** Phase 07, sub-phase 07.1
**Commit:** `pending`

## What Changed

- Rebuilt `examples/README.md` as an executable runtime tour covering compile,
  graph planning, fixture runs, selective recompute, `run<T>` composition,
  effect gates, required eval acceptance, package metadata, install refs, and
  provider selection.
- Added `test/examples-tour.test.ts` so the tour examples compile, plan, run,
  and accept evals through the real `prose run` meta-harness path.
- Updated `examples/evals/examples-quality.eval.prose.md` to consume the
  subject run payload emitted by eval execution and return a JSON eval verdict.
- Moved `scripts/measure-examples.ts` off legacy fixture materialization for
  the selective recompute baseline and onto `runFile(..., provider: "fixture")`.
- Regenerated the examples package IR golden and measurement docs.
- Renumbered Phase 07 signpost targets so they continue after 032 eval
  acceptance.

## How To Test

- `bun test test/examples-tour.test.ts test/package-ir.test.ts`
- `bun run measure:examples`
- `bun run prose publish-check examples --strict --no-pretty`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted examples and package IR tests passed: 11 tests.
- Measurement script completed and refreshed `docs/measurements/latest.*`.
- Strict examples publish check passed.
- Typecheck passed.
- Full test suite passed: 147 passed, 1 skipped.

## Next

- Phase 07.2: harden `packages/std/roles` so the standard role components have
  the same executable, typed, effect-aware quality bar as the examples.

## Risks Or Open Questions

- Provider selection is documented at the runtime contract level. The CLI still
  only supports `fixture` without programmatic provider configuration; richer
  provider CLI configuration belongs in a later provider UX slice.
