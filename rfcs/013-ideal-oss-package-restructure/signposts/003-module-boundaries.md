# 003: Module Boundaries

**Date:** 2026-04-25
**Phase:** Phase 01, sub-phase 01.3
**Commit:** same commit as this signpost

## What Changed

- Added module boundary directories under `src/`.
- Replaced the flat public `src/index.ts` export list with architectural
  namespace exports.
- Added `phases/01-contract-baseline/module-boundaries.md` with the boundary
  map and temporary flat-file locations.

## How To Test

- `bun test`
- `bunx tsc --noEmit`

## Results

- `bun test` passed: 70 tests across 6 files.
- `bunx tsc --noEmit` passed.

## Next

- Phase 01.4: remove or quarantine non-ideal compatibility surfaces, beginning
  with fixture materialization being named as a fixture/prototype path rather
  than the runtime center.

## Risks Or Open Questions

- The new modules are mostly barrels. Later phases should move logic into them
  rather than allowing both architectures to linger.
