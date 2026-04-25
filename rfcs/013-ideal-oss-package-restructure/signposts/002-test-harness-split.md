# 002: Test Harness Split

**Date:** 2026-04-25
**Phase:** Phase 01, sub-phase 01.2
**Commit:** same commit as this signpost

## What Changed

- Replaced the monolithic `test/compiler.test.ts` with focused suites:
  - `test/source-ir.test.ts`
  - `test/runtime-materialization.test.ts`
  - `test/runtime-planning.test.ts`
  - `test/source-tooling.test.ts`
  - `test/package-registry.test.ts`
- Added `test/support.ts` for shared fixtures, temp-path helpers, git helpers,
  source/runtime imports, and CLI smoke helpers.
- Moved an existing materialize CLI smoke onto `runProseCli` so future CLI
  coverage can reuse one helper.

## How To Test

- `bun test`
- `bunx tsc --noEmit`

## Results

- `bun test` passed: 69 tests across 5 files.
- `bunx tsc --noEmit` passed.

## Next

- Phase 01.3: establish the public module boundary scaffold for `core`,
  `source`, `ir`, `schema`, `graph`, `meta`, `store`, `runtime`, `providers`,
  `policy`, `eval`, `package`, and `cli`.

## Risks Or Open Questions

- This split is intentionally behavior-preserving. The suites are now ready for
  stricter golden fixtures, but the current assertions still reflect the old
  runtime scaffolding until later phases replace it.
