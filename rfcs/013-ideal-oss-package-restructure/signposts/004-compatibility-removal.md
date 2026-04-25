# 004: Compatibility Removal

**Date:** 2026-04-25
**Phase:** Phase 01, sub-phase 01.4
**Commit:** same commit as this signpost

## What Changed

- Removed the top-level `prose materialize` command.
- Added `prose fixture materialize` for deterministic fixture-only run record
  generation.
- Renamed the package script from `materialize` to `fixture:materialize`.
- Updated active docs and CLI help so fixture materialization is not presented
  as the runtime center.
- Added a regression test proving the old top-level command is no longer
  accepted.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts fixture materialize fixtures/compiler/hello.prose.md --run-root /tmp/openprose-fixture-smoke --run-id phase-01-4 --output message=ok`
- `bun bin/prose.ts help`

## Results

- `bun test` passed: 71 tests across 6 files.
- `bunx tsc --noEmit` passed.
- `bun bin/prose.ts fixture materialize fixtures/compiler/hello.prose.md --run-root /tmp/openprose-fixture-smoke --run-id phase-01-4 --output message=ok` passed and wrote a succeeded fixture run.
- `bun bin/prose.ts help` passed and now advertises `fixture materialize` instead of top-level `materialize`.

## Next

- Phase 02.1: start replacing single-file compile as the canonical runtime
  contract with package/workspace compilation.

## Risks Or Open Questions

- `remote execute` still depends on the fixture materializer internally. That
  is acceptable only until the real runtime kernel lands.
