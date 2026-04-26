# 049: Source Dead Code Hygiene

**Date:** 2026-04-26
**Phase:** Cross-phase runtime hardening

## What Changed

- Removed unused production imports from eval execution, materialization, and
  preflight modules.
- Removed the obsolete `hasFixtureOutputs` helper from `run.ts` after provider
  selection moved into the runtime provider registry.
- Re-ran the runtime confidence matrix and refreshed the tracked latest
  measurement artifacts.
- Kept the cleanup deliberately source-only; the broader strict unused-symbol
  scan still reports noisy test imports that should be handled separately if we
  decide to make test import hygiene a project rule.

## How To Test

- `bunx tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false 2>&1 | rg '^src/' || true`
- `bun run typecheck`
- `bun test test/eval-execution.test.ts test/runtime-materialization.test.ts test/source-tooling.test.ts test/run-entrypoint.test.ts`
- `bun test`
- `bun run confidence:runtime`

## Result

- Strict source unused-symbol scan returned no `src/` findings.
- Targeted runtime/eval/source tests passed: 53 pass.
- Full OSS suite passed: 170 pass, 1 skipped live smoke.
- Runtime confidence matrix passed: 15 checks.
- Typecheck passed.

## Next

- Continue looking for narrow source-boundary cleanups that reduce `run.ts`
  surface area without changing runtime behavior.
- Treat a full test-import unused-symbol cleanup as a separate style slice if it
  becomes worth enforcing globally.
