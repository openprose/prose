# 034: Std Roles

**Date:** 2026-04-26
**Phase:** Phase 07, sub-phase 07.2
**Commit:** `pending`

## What Changed

- Rewrote the ten `packages/std/roles/*.prose.md` contracts into a tighter
  executable shape: typed ports, declared effects, and fenced `### Execution`
  instructions.
- Shifted structured role outputs such as classification, evaluation,
  extraction, routing, verification, plans, findings, and sources to JSON-shaped
  ports where downstream composition benefits from machine-readable artifacts.
- Updated `packages/std/roles/README.md` with a fixture-run smoke and the new
  role contract shape.
- Treated natural-language fenced `prose` execution lines as valid text steps
  instead of warnings, matching the intended model where role instructions can
  be executable harness guidance.
- Added `test/std-roles.test.ts` to compile every role, require executable text,
  require typed ports/effects, and run each role through the fixture provider.
- Regenerated the standard-library package IR golden.

## How To Test

- `bun test test/std-roles.test.ts test/execution-ir.test.ts test/package-ir.test.ts`
- `bun run prose publish-check packages/std --strict --no-pretty`
- `for f in packages/std/roles/*.prose.md; do bun bin/prose.ts lint "$f" --format text >/tmp/openprose-role-lint.out || exit 1; done`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted std roles, execution IR, and package IR tests passed: 12 tests.
- Strict std publish check passed.
- Every role source file linted with zero diagnostics.
- Typecheck passed.
- Full test suite passed: 149 passed, 1 skipped.

## Next

- Phase 07.3: convert std controls and composites to executable semantics or
  explicitly demote pattern-only entries so the standard library does not
  advertise unsupported runtime behavior.

## Risks Or Open Questions

- Text execution steps are now accepted without diagnostics. This is deliberate
  for role guidance, but future tooling should distinguish role-style harness
  instructions from structured control IR when rendering docs and graph views.
