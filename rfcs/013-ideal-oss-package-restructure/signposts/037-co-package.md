# 037: Co Package

**Date:** 2026-04-26
**Phase:** Phase 07, sub-phase 07.5
**Commit:** `pending`

## What Changed

- Tightened `packages/co/programs/company-repo-checker.prose.md` into the
  reusable company-as-code kernel: JSON report ports, explicit read effect,
  optional defaulted roots, and unique intermediate failure ports.
- Removed ambiguous graph returns by routing public `report`, `passed`, and
  `failures` through `repo-readiness-reporter` only.
- Rewrote `packages/co/evals/company-repo-checker.eval.prose.md` as an
  executable run-store eval with typed `subject` input and JSON verdict output.
- Updated `packages/co/README.md` for the Bun-backed CLI and hosted package IR
  model, replacing the older agent-session-only instructions.
- Added `test/co-package.test.ts` covering package IR shape, required eval
  acceptance through the fixture provider, and a local-process provider smoke.
- Regenerated the `packages/co` package IR golden.

## How To Test

- `bun test test/co-package.test.ts test/package-ir.test.ts`
- `bun run prose publish-check packages/co --strict --no-pretty`
- `bun bin/prose.ts lint packages/co/programs/company-repo-checker.prose.md --format text`
- `bun bin/prose.ts lint packages/co/evals/company-repo-checker.eval.prose.md --format text`
- `rg "agent-session|claude -p|codex exec|Press|Forme|state\\.md|program\\.md|bindings|kind: delivery|tier: delivery" packages/co -n`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted co package and package IR tests passed: 9 tests.
- Strict co publish check passed with 6 components, 1 eval link, and 1 example
  link.
- Strict examples, std, and co publish checks passed.
- Program and eval sources linted with zero diagnostics.
- Stale hosted/runtime vocabulary search returned no matches in `packages/co`.
- Typecheck passed.
- Full test suite passed: 156 passed, 1 skipped.

## Next

- Phase 07 exit review: run the full suite, scan examples/std/co for remaining
  non-executable claims, and decide whether the next slice is customer reference
  migration or runtime/meta-harness hardening.

## Risks Or Open Questions

- The local-process smoke proves the provider artifact contract, but it does not
  perform a real repository walk. A future harness provider or native static
  checker can make the same contract operational without changing package
  shape.
