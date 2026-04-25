# 031: Executable Evals

**Date:** 2026-04-25
**Phase:** Phase 06, sub-phase 06.5
**Commit:** same commit as this signpost

## What Changed

- Replaced the placeholder eval namespace with executable eval APIs.
- Added package eval discovery through package IR resources.
- Added eval execution over subject run directories or `run.json` files.
- Passed the subject run as structured JSON into eval contracts.
- Added pass/fail/score/verdict inference from eval output artifacts.
- Added durable local eval result records under `run-dir/evals/*.json`.
- Added `prose eval <eval.prose.md> --subject-run <run-dir>` as the CLI
  surface.
- Added tests for discovery, passing evals, failing evals, and CLI execution.

## How To Test

- `bun test test/eval-execution.test.ts test/module-boundaries.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted eval/module tests passed: 5 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 141 tests, 1 skipped live smoke across 22 files.

## Next

- Phase 06.6: gate current pointer updates on required eval results.

## Risks Or Open Questions

- Evals are recorded beside the subject run rather than mutating the subject
  run record. This preserves run immutability and leaves acceptance gating to
  the next slice.
- Outcome inference is intentionally simple. Richer eval schemas should become
  schema-resolved once package schemas are fully loaded.
