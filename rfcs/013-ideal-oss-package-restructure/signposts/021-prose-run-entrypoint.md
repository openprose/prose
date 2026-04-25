# 021: `prose run` Entry Point

**Date:** 2026-04-25
**Phase:** Phase 05, sub-phase 05.1
**Commit:** same commit as this signpost

## What Changed

- Added `runFile` and `runSource` as the first local meta-harness APIs.
- Added `prose run` as a CLI command.
- Added provider resolution with explicit fixture selection and fixture-output
  based defaulting.
- Materialized provider-backed run files, provider artifacts, run attempts, and
  run index entries.
- Exported run APIs from the runtime namespace.
- Added programmatic and CLI tests for fixture-backed `prose run`.
- Documented the slice in `phases/05-meta-harness/prose-run-entrypoint.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/run-entrypoint.test.ts`
- `bun bin/prose.ts run fixtures/compiler/hello.prose.md --provider fixture --output message=Hello`

## Results

- Targeted run entrypoint tests passed: 3 tests across 1 file.
- `bunx tsc --noEmit` passed.
- CLI smoke passed:
  `bun bin/prose.ts run fixtures/compiler/hello.prose.md --provider fixture --output message=Hello`.
- `bun test` passed: 113 tests, 1 skipped live smoke across 19 files.

## Next

- Phase 05.2: execute multi-node graphs in dependency order.

## Risks Or Open Questions

- This slice intentionally supports one executable component only.
- The new run path writes through provider artifacts, while the old fixture
  materializer remains for remote-envelope compatibility until the meta-harness
  fully replaces it.
- Current/reuse semantics are still plan-only and will be enforced in the
  dependency executor.
