# 042: Runtime Release Candidate

**Date:** 2026-04-26
**Phase:** Phase 08, sub-phase 08.5
**Commit:** `pending`

## What Changed

- Added `bun run confidence:runtime` as an executable release-candidate
  confidence matrix.
- The matrix smokes:
  - `compile` for `examples`, `packages/std`, and `packages/co`
  - `plan` and `graph`
  - provider-backed `run`
  - `status` and `trace`
  - executable `eval`
  - hosted `remote execute`
  - package metadata
  - strict publish checks for `examples`, `std`, and `co`
  - registry-ref `install`
- Added generated confidence reports:
  - `docs/measurements/runtime-confidence.latest.md`
  - `docs/measurements/runtime-confidence.latest.json`
- Added `docs/release-candidate.md` with release criteria and follow-up.
- Updated docs and changelog to describe the runtime-centered OSS package
  rather than the older fixture-centered transitional surface.

## How To Test

- `bun run confidence:runtime`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Runtime confidence matrix passed: 15 checks.
- Typecheck passed.
- Full OSS test suite passed: 161 tests passed, 1 skipped.

## Completion Notes

- RFC 013 Phase 08 now has package metadata, real remote envelopes, hosted
  contract fixtures, polished CLI/runtime views, and a repeatable release
  confidence matrix.
- The remaining local OSS release risk is the live Pi smoke, which stays gated
  behind explicit enablement because it depends on external credentials,
  provider availability, and spend.

## Next

- Move from the OSS package back to the platform accommodation workstream:
  adopt the new hosted-runtime fixtures directly in platform tests, update the
  platform envelope/types to match schema `0.2`, and continue the Workstream 03
  provider/runtime alignment.
