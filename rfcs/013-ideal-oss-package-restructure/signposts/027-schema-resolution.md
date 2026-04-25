# 027: Schema Resolution

**Date:** 2026-04-25
**Phase:** Phase 06, sub-phase 06.1
**Commit:** same commit as this signpost

## What Changed

- Added recursive OpenProse type expression parsing.
- Added JSON Schema-compatible projection helpers for port types.
- Added `type_expr` to `PortIR`.
- Included parsed type IR in source and package semantic projections.
- Exported type parsing/projection helpers from the schema namespace.
- Updated package summary goldens for intentional semantic hash changes.
- Renumbered Phase 06 signposts so they follow Phase 05 without collision.
- Added schema-resolution tests for primitives, generics, arrays, run refs, and
  compiled port type IR.
- Documented the slice in `phases/06-types-policy-evals/schema-resolution.md`.

## How To Test

- `bun test test/schema-resolution.test.ts test/source-ir.test.ts test/package-ir.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted schema/source/package tests passed: 19 tests across 3 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 128 tests, 1 skipped live smoke across 21 files.

## Next

- Phase 06.2: validate runtime inputs, outputs, and artifacts against available
  schema projections.

## Risks Or Open Questions

- Named type resolution is not yet a package/dependency symbol table. The parser
  and projection shape are in place; dependency-backed resolution comes next.
