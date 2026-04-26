# 048: Trace Artifact Visibility

**Date:** 2026-04-26
**Phase:** Phase 03 follow-up, store-backed trace views

## What Changed

- Added `TraceArtifactView` to the trace model.
- Updated `traceFile` to load artifact records from an adjacent `.prose-store`
  when one is available.
- Rendered compact artifact summaries in `prose trace`, including:
  - direction and port
  - content type
  - schema status
  - short content hash
  - policy labels when present
- Kept trace loading permissive for exported or loose run directories without
  an adjacent store.
- Added library and CLI assertions so artifact visibility does not regress.
- Updated the Phase 03 plan with the trace-artifact projection slice.

## How To Test

- `bun test test/runtime-planning.test.ts test/cli-ux.test.ts test/run-entrypoint.test.ts test/artifact-store.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- `bun run confidence:runtime`
- `bun run typecheck`

## Result

- Targeted trace/artifact/runtime tests passed: 42 pass.
- Full OSS suite passed: 170 pass, 1 skipped live smoke.
- Runtime confidence matrix passed: 15 checks.
- Typecheck passed.

## Next

- Consider moving trace/status store-root discovery into a shared store-view
  helper if more views need adjacent-store lookup.
- Keep trace summaries compact; full artifact content remains in the artifact
  store and run bindings.
