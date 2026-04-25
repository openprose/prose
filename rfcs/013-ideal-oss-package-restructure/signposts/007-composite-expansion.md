# 007: Source-Mapped Composite Expansion

**Date:** 2026-04-25
**Phase:** Phase 02, sub-phase 02.3
**Commit:** same commit as this signpost

## What Changed

- Added `CompositeExpansionIR` and made component expansions typed.
- Parsed Level 1 composite service shorthand into `compose` services with
  explicit `with` bindings.
- Resolved package-local composite references during package compilation.
- Added `$compose` package graph edges from composed services to composite
  definitions.
- Added focused composite package fixtures and a std composed-reviewer golden.
- Updated package IR summary goldens to include expansion summaries.
- Documented the slice in
  `phases/02-ir-and-source-model/composite-expansion.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts graph packages/std/examples/composed-reviewer/index.prose.md >/tmp/openprose-phase-02-3-composed-reviewer-graph.mmd`

## Results

- `bun test` passed: 82 tests across 9 files.
- `bunx tsc --noEmit` passed.
- The graph CLI smoke passed for `packages/std/examples/composed-reviewer`.

## Next

- Phase 02.4: capture schemas, evals, examples, effects, access, and policy
  labels directly in package IR with explicit hash semantics.

## Risks Or Open Questions

- Composite expansion is now represented and source-mapped, but runtime
  execution still needs the meta-harness to coordinate child harness sessions.
- The package currently supports one canonical shorthand for composition. Before
  migrating the stdlib examples, decide whether decorator-like composition
  should be deleted, normalized, or represented as a distinct source construct.
