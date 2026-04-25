# 012: Graph Node Pointers

**Date:** 2026-04-25
**Phase:** Phase 03, sub-phase 03.3
**Commit:** same commit as this signpost

## What Changed

- Added `LocalGraphNodePointer`.
- Added pointer update/read/list APIs.
- Preserved accepted `current_run_id` when later failed or pending runs arrive.
- Stored graph node pointers under `.prose/graphs/<graph>/nodes/<node>.json`.
- Updated `statusPath(root)` to detect store roots and read the run index.
- Added tests for current/latest/failed/pending pointer semantics.
- Added a status smoke test against a store root.
- Documented the slice in `phases/03-run-store/graph-node-pointers.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/graph-node-pointers.test.ts test/run-store.test.ts`

## Results

- Targeted pointer/store tests passed: 7 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 95 tests across 13 files.

## Next

- Phase 03.4: record attempts, failures, retries, and resume points.

## Risks Or Open Questions

- `trace` and `graph` still need deeper store integration after attempts and
  fixture store writes land. Status is the first store-backed view.
- Pointer writes are explicit library calls until the meta-harness owns run
  acceptance and current-pointer updates.
