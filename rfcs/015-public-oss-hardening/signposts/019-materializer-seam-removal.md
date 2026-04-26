# Signpost 019: Materializer Seam Removal

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Deleted the old `src/materialize.ts` runtime path instead of keeping it as a
  compatibility layer.
- Removed `materializeFile` and `materializeSource` from the runtime barrel and
  test support exports.
- Migrated deterministic runtime and planning tests to the canonical
  `runSource` path with scripted Pi outputs.
- Added a module-boundary regression so the old materializer API cannot quietly
  return to the public entry point.
- Fixed the behavior exposed by the migration: a one-component `kind: program`
  source now runs through graph execution and produces a graph run record.
- Improved graph-level failure summaries so node validation, policy, and
  runtime diagnostics remain visible at the graph record boundary.
- Refreshed package IR goldens and deterministic measurement reports to match
  the current std/examples package metadata.

## Validation

- `rg -n "materializeFile|materializeSource|Local materializer|materialize\\.started" src test -S`
- `bun test test/runtime-materialization.test.ts test/runtime-planning.test.ts test/runtime-profiles.test.ts test/module-boundaries.test.ts test/package-registry.test.ts`
- `bun test test/run-entrypoint.test.ts test/eval-execution.test.ts test/package-ir.test.ts`
- `bun test`
- `bun run typecheck`
- `git diff --check`
- `bun run confidence:runtime`

## Next

- Continue the runtime robustness pass with Pi runtime-profile preflight and
  session persistence clarity.
- Keep an eye on remaining "materialization" wording in tests/docs: the noun is
  still correct for run records, but source API references to a separate
  materializer should stay gone.
