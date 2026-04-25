# 010: Local Run Store Layout

**Date:** 2026-04-25
**Phase:** Phase 03, sub-phase 03.1
**Commit:** same commit as this signpost

## What Changed

- Added a typed local store layout for `.prose/runs`, `.prose/artifacts`,
  `.prose/graphs`, `.prose/indexes`, and `.prose/meta`.
- Added versioned store metadata in `meta/store.json`.
- Added initialization and metadata read APIs.
- Added immutable JSON record write/read helpers.
- Added a run query index read/upsert API.
- Added a layout golden at `fixtures/store/layout.golden.json`.
- Added store tests for layout, initialization, immutable writes, run index
  sorting/upsert, and unsupported version rejection.
- Documented the slice in `phases/03-run-store/run-store-layout.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/run-store.test.ts`

## Results

- `bun test test/run-store.test.ts` passed: 5 tests.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 91 tests across 11 files.

## Next

- Phase 03.2: model artifacts as first-class store records with hash, content
  type, policy labels, provenance, and storage location.

## Risks Or Open Questions

- Existing materialization still writes the old loose run directory. This is
  intentional until the artifact and pointer records exist.
- The migration hook is only a hard version guard for now. The first real
  migration should be added when the store version changes.
