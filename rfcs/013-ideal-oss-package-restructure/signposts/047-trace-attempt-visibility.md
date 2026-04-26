# 047: Trace Attempt Visibility

**Date:** 2026-04-26
**Phase:** Phase 03 follow-up, store-backed trace views

## What Changed

- Added `TraceAttemptView` to the trace model.
- Updated `traceFile` to load attempt records from an adjacent `.prose-store`
  when one is available.
- Rendered attempt summaries in `prose trace`, including:
  - attempt number
  - status
  - diagnostic codes
  - failure message
  - whether a provider session reference was recorded
- Kept trace loading permissive for run directories without an adjacent store.
- Added library and CLI assertions so attempt visibility does not regress.
- Updated the Phase 03 plan with the trace-attempt projection slice.

## How To Test

- `bun test test/runtime-planning.test.ts test/cli-ux.test.ts test/run-entrypoint.test.ts test/run-attempts.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- `bun run confidence:runtime`
- `bun run typecheck`

## Result

- Targeted trace/runtime tests passed: 42 pass.
- Full OSS suite passed: 170 pass, 1 skipped live smoke.
- Runtime confidence matrix passed: 15 checks.
- Typecheck passed.

## Next

- Consider projecting artifact summaries into trace from the store, using the
  same pattern: store-backed when available, loose-run-compatible when not.
- Keep deeper run-store query APIs behind explicit module boundaries before
  further reducing `src/run.ts`.
