# 035: Std Controls And Composites

**Date:** 2026-04-26
**Phase:** Phase 07, sub-phase 07.3
**Commit:** `pending`

## What Changed

- Rewrote all `packages/std/controls/*.prose.md` files as honest typed pattern
  contracts: `control_state: Json<...ControlState>` in,
  `control_result: Json<...ControlResult>` out, `pure` effect, and fenced
  prose execution guidance.
- Rewrote all `packages/std/composites/*.prose.md` files as typed topology or
  measurement pattern contracts: `composite_state: Json<...State>` in,
  `composite_result: Json<...Result>` out, `pure` effect, and executable prose
  guidance.
- Removed JavaScript-like `rlm(...)` sketches from executable std surfaces.
- Updated controls/composites READMEs to distinguish native runtime support from
  pattern-only semantics until richer control IR exists.
- Added `test/std-patterns.test.ts` covering typed ports, effects, absence of
  JS sketches, and fixture-provider smoke runs for every control and composite.
- Updated package/composite-expansion goldens after the std surface changed.

## How To Test

- `bun test test/std-patterns.test.ts test/package-ir.test.ts`
- `bun test test/composite-expansion.test.ts test/std-patterns.test.ts test/package-ir.test.ts`
- `for f in packages/std/controls/*.prose.md packages/std/composites/*.prose.md; do bun bin/prose.ts lint "$f" --format text >/tmp/openprose-pattern-lint.out || exit 1; done`
- `bun run prose publish-check packages/std --strict --no-pretty`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted pattern/package tests passed.
- Every control and composite source file linted with zero diagnostics.
- Strict std publish check passed.
- Typecheck passed.
- Full test suite passed: 151 passed, 1 skipped.

## Next

- Phase 07.4: update std eval components for the current run store, artifacts,
  traces, and acceptance records.

## Risks Or Open Questions

- Variable-width controls and iterative composites are now represented honestly
  as pattern contracts, not native runtime primitives. A later runtime/control IR
  slice can promote specific patterns to deterministic meta-harness execution
  when the semantics are ready.
