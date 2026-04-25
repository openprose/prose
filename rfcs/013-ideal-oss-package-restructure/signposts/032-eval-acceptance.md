# 032: Eval Acceptance Gates

**Date:** 2026-04-25
**Phase:** Phase 06, sub-phase 06.6
**Commit:** same commit as this signpost

## What Changed

- Added `requiredEvals` and `advisoryEvals` to runtime options.
- Added `--required-eval` and `--advisory-eval` to `prose run`.
- Executed eval contracts before final acceptance for successful runs.
- Recorded eval summaries on run records with status, score, and eval run id.
- Rejected acceptance when a required eval fails.
- Prevented graph node current pointer updates when graph acceptance is not
  accepted.
- Added a regression test proving a failed required eval leaves current pointers
  unset while preserving latest attempted runs.

## How To Test

- `bun test test/eval-execution.test.ts test/run-entrypoint.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted eval/runtime tests passed: 25 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 142 tests, 1 skipped live smoke across 22 files.

## Next

- Phase 07: migrate std/examples onto the now policy/eval-aware runtime
  surface and ensure the reference examples demonstrate the complete pattern.

## Risks Or Open Questions

- Required evals currently run with the same provider and fixture-output map as
  the subject run. That is convenient locally but hosted execution should model
  eval provider selection explicitly.
- Eval gates are run-level. Component-scoped eval pairing can be layered on top
  now that the acceptance path exists.
