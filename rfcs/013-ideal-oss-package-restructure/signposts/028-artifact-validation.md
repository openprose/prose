# 028: Artifact Validation

**Date:** 2026-04-25
**Phase:** Phase 06, sub-phase 06.2
**Commit:** same commit as this signpost

## What Changed

- Added runtime text validation against parsed type expressions.
- Blocked invalid JSON-shaped inputs before provider execution.
- Failed runs when provider outputs violate checkable output types.
- Stored provider artifact schema statuses through the local artifact store.
- Added invalid input and invalid output tests.
- Updated graph fixture test outputs that declare array types to use JSON array
  fixture values.
- Documented the slice in `phases/06-types-policy-evals/artifact-validation.md`.

## How To Test

- `bun test test/run-entrypoint.test.ts test/runtime-control.test.ts test/schema-resolution.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted runtime/schema tests passed: 20 tests across 3 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 130 tests, 1 skipped live smoke across 21 files.

## Next

- Phase 06.3: validate `run<T>` provenance against compatible upstream run
  records.

## Risks Or Open Questions

- Named schema validation is still deferred until package schema resources are
  resolved into a symbol table.
- `Markdown<T>` is intentionally unchecked for now; structural Markdown evals
  should be modeled as evals, not ad hoc string validation.
