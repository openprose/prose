# 007 Default Store Layout

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: separate default prose store layout`

## Finding

The default run-root shape is `.prose/runs`, but local store metadata and run
attempt records were inferred under `.prose` itself. That mixed runtime store
records with user-facing run directories. Custom run roots can still use
`<runRoot>/.prose-store`, but the default project layout should be clearer.

## What Changed

- Added `src/store/roots.ts` for run-root to store-root inference.
- Default `.prose/runs` now maps to `.prose/store`.
- Custom run roots still map to `<runRoot>/.prose-store`.
- Trace lookup now checks the new `.prose/store` location for default run
  directories.
- Added unit coverage for store-root inference and integration coverage that a
  default-shape run writes metadata to `.prose/store` and remains traceable.
- Marked the RFC 015 TODO item as done.

## Tests Run

- `bun test test/run-store.test.ts test/run-entrypoint.test.ts test/runtime-planning.test.ts test/trace-artifacts.test.ts`
- `bun run confidence:runtime`
- `bun run typecheck`
- `git diff --check`

## Result

The default project layout is now easier to explain:

- `.prose/runs`: user-facing run directories
- `.prose/store`: local indexes, attempt records, artifact records, and graph
  pointers

## Next Slice

Move to run/artifact ID safety or remote stdout/stderr semantics.
