# 025: Runtime Control

**Date:** 2026-04-25
**Phase:** Phase 05, sub-phase 05.5
**Commit:** same commit as this signpost

## What Changed

- Added `retryRunFile` and `retryRunSource` runtime APIs.
- Added `resumeRunFile` and `resumeRunSource` runtime APIs.
- Added `cancelRunPath` to record cancellation attempts and update the local run
  index.
- Exported runtime controls from the runtime namespace.
- Added cancellation control records under `controls/`.
- Added tests for retrying a failed graph node, cancelling a blocked run, and
  resuming a human-gated run with approvals.
- Documented the slice in `phases/05-meta-harness/runtime-control.md`.

## How To Test

- `bun test test/runtime-control.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted runtime control tests passed: 3 tests across 1 file.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 124 tests, 1 skipped live smoke across 20 files.

## Next

- Phase 05.6: assemble graph runs and current pointers with stricter acceptance
  rules, especially around skipped nodes, rejected runs, and provider telemetry.

## Risks Or Open Questions

- Retry/resume are API-level controls, not CLI controls yet.
- Cancel records local intent and lineage. Interrupting live provider sessions
  will need provider-specific cancellation hooks.
