# 001: Contract Inventory

**Date:** 2026-04-25
**Phase:** Phase 01, sub-phase 01.1
**Commit:** same commit as this signpost

## What Changed

- Added `phases/01-contract-baseline/current-contract-inventory.md`.
- Inventoried the current CLI commands, public exports, parser outputs, IR
  fields, run file shapes, package metadata fields, and std/co/example promises.
- Marked current surfaces as keep, migrate, replace, or delete so upcoming
  refactors can reshape the package without preserving accidental behavior.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts compile examples/hello.prose.md`
- `bun bin/prose.ts plan examples/selective-recompute.prose.md --input draft="A stable draft." --input company=openprose`
- `bun bin/prose.ts package examples --format json`
- `bun bin/prose.ts publish-check packages/std --strict`

## Results

- `bun test` passed: 69 tests.
- `bunx tsc --noEmit` passed.
- `bun bin/prose.ts compile examples/hello.prose.md` passed.
- `bun bin/prose.ts plan examples/selective-recompute.prose.md --input draft="A stable draft." --input company=openprose` passed.
- `bun bin/prose.ts package examples --format json` passed.
- `bun bin/prose.ts publish-check packages/std --strict` passed.

## Next

- Phase 01.2: split the monolithic test file into focused runtime suites while
  preserving current behavior.

## Risks Or Open Questions

- The inventory intentionally names deletion targets before replacements exist.
  Each deletion should happen only when the relevant replacement slice is ready.
