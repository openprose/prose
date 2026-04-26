# 041: CLI Docs And Runtime View Polish

**Date:** 2026-04-26
**Phase:** Phase 08, sub-phase 08.4
**Commit:** `pending`

## What Changed

- Updated CLI help to explain the core runtime loop and provider/meta-harness
  model directly in `prose --help`.
- Made `prose status` and `prose trace` report concise user-facing errors
  instead of uncaught stack dumps when paths are missing or unreadable.
- Added acceptance reasons to status and trace views so successful, blocked,
  rejected, and pending runs explain why they are in that state.
- Annotated Mermaid graph output with graph identity, requested outputs, stale
  reasons, and blocked reasons.
- Updated README/docs quickstarts to show the local loop as
  `run -> status -> trace`.
- Added `test/cli-ux.test.ts` to keep the CLI help, failure text, status,
  trace, and graph surfaces from regressing.

## How To Test

- `bun test test/cli-ux.test.ts test/runtime-planning.test.ts test/graph-node-pointers.test.ts`
- `bun test test/cli-ux.test.ts test/runtime-planning.test.ts test/run-entrypoint.test.ts test/hosted-contract-fixtures.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted CLI/planning/pointer suite passed: 21 tests.
- Targeted CLI/runtime/hosted suite passed: 41 tests.
- Typecheck passed.
- Full OSS test suite passed: 161 tests passed, 1 skipped.

## Next

- Phase 08.5: run the final confidence matrix, freeze the release checklist,
  and prepare the OSS runtime release-candidate signpost.

## Risks Or Open Questions

- Graph labels now include stale and blocked reasons. This is helpful for
  generated diagrams and local debugging, but future large graphs may need a
  compact mode if labels become too dense.
