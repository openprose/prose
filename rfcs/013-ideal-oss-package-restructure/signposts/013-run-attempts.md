# 013: Run Attempts

**Date:** 2026-04-25
**Phase:** Phase 03, sub-phase 03.4
**Commit:** same commit as this signpost

## What Changed

- Added immutable `LocalRunAttemptRecord` types.
- Added failure, retry, and resume point record shapes.
- Added attempt write/read/list store APIs.
- Indexed attempts by run id.
- Updated store-root status summaries with attempt count and latest attempt
  status.
- Added tests for failed attempts, retry metadata, resume metadata, status
  rendering, and current pointer safety.
- Documented the slice in `phases/03-run-store/run-attempts.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/run-attempts.test.ts test/graph-node-pointers.test.ts`

## Results

- Targeted attempt/pointer tests passed: 4 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 97 tests across 14 files.

## Next

- Phase 03.5: route fixture materialization through the local store APIs.

## Risks Or Open Questions

- Retry and resume are recorded but not executed.
- Provider session references are plain strings until provider protocol work in
  Phase 04 gives them a richer shape.
