# 011: Artifact Records

**Date:** 2026-04-25
**Phase:** Phase 03, sub-phase 03.2
**Commit:** same commit as this signpost

## What Changed

- Added `LocalArtifactRecord` and supporting provenance, schema, and storage
  types.
- Added content-addressed local blob storage.
- Added artifact record writes and reads.
- Added artifact content reads.
- Added artifact indexes by run id, output binding, and content hash.
- Exported artifact store APIs from the `store` namespace.
- Added artifact store tests for provenance, hashes, content reads, and index
  lookup.
- Documented the slice in `phases/03-run-store/artifact-records.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/artifact-store.test.ts test/run-store.test.ts`

## Results

- Targeted artifact/store tests passed: 7 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 93 tests across 12 files.

## Next

- Phase 03.3: add graph node current/latest pointers and update status/trace
  views toward the store model.

## Risks Or Open Questions

- Artifact records are not yet used by fixture materialization.
- Binary artifact handling is represented by content metadata but not yet
  implemented as a separate write path.
