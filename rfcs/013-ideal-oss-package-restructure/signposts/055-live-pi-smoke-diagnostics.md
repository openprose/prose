# 055: Live Pi Smoke Diagnostics

**Date:** 2026-04-26
**Phase:** Phase 04/05 follow-up, live provider test backpressure

## What Changed

- Improved the opt-in live Pi SDK smoke test so provider failures include a
  sanitized diagnostic payload.
- The failure payload includes status, diagnostics, and provider session
  metadata, but not API keys.
- Kept the live smoke opt-in behind `OPENPROSE_PI_INTEGRATION=1`.

## How To Test

- `bun test test/pi-provider.test.ts`
- `bun run typecheck`
- `bunx tsc --noEmit --noUnusedLocals --noUnusedParameters --pretty false 2>&1 | rg '^src/' || true`
- `bun test`

## Result

- Targeted Pi provider tests passed: 5 pass, 1 skipped live smoke.
- Typecheck passed.
- Strict source unused-symbol scan returned no `src/` findings.
- Full OSS suite passed: 170 pass, 1 skipped live smoke.

## Next

- Re-run the opt-in live smoke after OpenRouter credits are available; failures
  should now show the exact provider diagnostic without a separate probe.
