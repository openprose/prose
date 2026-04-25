# 029: Run Provenance Validation

**Date:** 2026-04-25
**Phase:** Phase 06, sub-phase 06.3
**Commit:** same commit as this signpost

## What Changed

- Added a local store accessor for loading indexed run records by run id.
- Validated caller-supplied `run<T>` references before provider execution.
- Blocked missing run references, non-succeeded references, unaccepted
  references, component mismatches, and package-qualified mismatches.
- Parsed both `run: <id>` shorthand and JSON `{ "run_id": "..." }` references.
- Updated the run-aware test to create a real prior materialization rather than
  trusting an arbitrary run id string.
- Added negative tests for missing and incompatible run references.

## How To Test

- `bun test test/run-entrypoint.test.ts test/run-store.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted runtime/store tests passed: 21 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 132 tests, 1 skipped live smoke across 21 files.

## Next

- Phase 06.4: implement local policy records for label propagation,
  declassification, budgets, idempotency keys, and performed effects.

## Risks Or Open Questions

- `run<T>[]` should become first-class once binding records can represent more
  than one source run id.
- Explicit run ids validate exact accepted materializations. Future named
  current references should additionally validate current pointers.
