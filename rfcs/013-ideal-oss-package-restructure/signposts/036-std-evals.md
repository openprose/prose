# 036: Std Evals

**Date:** 2026-04-26
**Phase:** Phase 07, sub-phase 07.4
**Commit:** `pending`

## What Changed

- Rewrote the seven `packages/std/evals/*.prose.md` files as run-store-native
  `kind: test` contracts instead of multi-service sketches tied to the older
  filesystem run shape.
- Standardized eval inputs around materialized run payloads, artifact refs,
  trace refs, acceptance records, policy records, source snapshots, and platform
  context.
- Standardized eval outputs as `Json<...>` verdict records with top-level
  `passed`, `score`, and `verdict` fields so local and hosted eval acceptance
  can consume them directly.
- Updated the std README to describe evals as acceptance-gate contracts.
- Added `test/std-evals.test.ts` to compile every std eval, reject stale
  runtime vocabulary, require typed JSON outputs/effects/execution text, and run
  every eval through the fixture provider.
- Regenerated the standard-library package IR golden after the eval surface
  dropped internal sketch services.

## How To Test

- `bun test test/std-evals.test.ts test/package-ir.test.ts`
- `bun run prose publish-check packages/std --strict --no-pretty`
- `for f in packages/std/evals/*.prose.md; do bun bin/prose.ts lint "$f" --format text >/tmp/openprose-eval-lint.out || exit 1; done`
- `rg "state\\.md|program\\.md|manifest\\.md|services/|bindings|__error\\.md|Press|press layer|Forme layer|run directory" packages/std/evals -n`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted std eval and package IR tests passed: 8 tests.
- Strict std publish check passed with 58 components and 7 eval links.
- Every std eval source file linted with zero diagnostics.
- Stale runtime vocabulary search returned no matches in `packages/std/evals`.
- Typecheck passed.
- Full test suite passed: 153 passed, 1 skipped.

## Next

- Phase 07.5: align the `packages/co` package with the executable runtime and
  the external Company as Code reference pattern.

## Risks Or Open Questions

- These evals are now contracts that the runtime can execute, not full
  deterministic evaluators. The meta-harness/provider still supplies the actual
  judgment, but the contract shape now gives it the correct run-store evidence
  and machine-readable acceptance target.
