# 014: Store-Backed Fixture Materialization

**Date:** 2026-04-25
**Phase:** Phase 03, sub-phase 03.5
**Commit:** same commit as this signpost

## What Changed

- Fixture materialization now writes through local store APIs.
- Added run index entries for graph and component records.
- Added attempt records for graph and component records.
- Added graph node pointer updates for component records.
- Added artifact records for caller inputs and outputs.
- Preserved existing inspectable run-directory files for trace/status fixtures.
- Added a store-backed fixture materialization regression test.
- Documented the slice in `phases/03-run-store/fixture-store-provider.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/runtime-materialization.test.ts test/runtime-planning.test.ts`

## Results

- Targeted runtime materialization/planning tests passed: 30 tests across 2
  files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 98 tests across 14 files.

## Next

- Phase 04: define the provider protocol and begin the Pi SDK path.

## Risks Or Open Questions

- `prose run --provider fixture` is deferred until Phase 05 because the
  meta-harness does not exist yet.
- Materialization is dual-written for now: legacy run files plus store records.
  That is intentional until trace/status/remote envelopes all read directly
  from the store.
