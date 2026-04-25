# 005: Package IR

**Date:** 2026-04-25
**Phase:** Phase 02, sub-phase 02.1
**Commit:** same commit as this signpost

## What Changed

- Added `PackageIR` and `PackageIRFile` contracts.
- Added `compilePackagePath(path)` as the package/workspace compiler entry
  point.
- Taught `prose compile <dir>` to emit package IR while keeping
  `prose compile <file.prose.md>` on file IR.
- Added package IR summary goldens for `examples`, `packages/std`, and
  `packages/co`.
- Added package IR tests and a CLI directory compile smoke.
- Documented the package IR slice in
  `phases/02-ir-and-source-model/package-ir.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts compile examples --no-pretty`
- `bun bin/prose.ts package examples --format json`

## Results

- `bun test` passed: 75 tests across 7 files.
- `bunx tsc --noEmit` passed.
- `bun bin/prose.ts compile examples --no-pretty` passed.
- `bun bin/prose.ts package examples --format json` passed.

## Next

- Phase 02.2: replace raw execution text with structured execution IR.

## Risks Or Open Questions

- Package IR currently builds a package graph from existing file-level
  component contracts. It is useful and deterministic, but structured execution
  IR is needed before it can be the full executable graph contract.
