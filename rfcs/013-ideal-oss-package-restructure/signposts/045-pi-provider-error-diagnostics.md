# 045: Pi Provider Error Diagnostics

**Date:** 2026-04-26
**Phase:** Phase 08 follow-up, live-provider hardening

## What Changed

- Tested the live Pi provider path through `prose run --provider pi` with an
  OpenRouter-backed model.
- Found that Pi can surface provider/model failures as session events rather
  than thrown prompt errors.
- Updated the Pi provider to translate event-level model errors into
  `pi_model_error` diagnostics.
- Stopped output-file validation from masking those upstream provider failures.
- Added a regression test covering duplicated Pi event errors and diagnostic
  de-duplication.
- Updated the release-candidate notes with the current live-provider smoke
  status.

## How To Test

- `bun test test/pi-provider.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- `bun run confidence:runtime`
- `bun run typecheck`

## Result

- Targeted Pi provider tests passed: 5 pass, 1 skipped live smoke.
- Full OSS suite passed: 163 pass, 1 skipped live smoke.
- Runtime confidence matrix passed: 15 checks.
- Typecheck passed.
- Live OpenRouter smoke reached the Pi provider and now reports the upstream
  insufficient-credits response as the run acceptance reason.

## Next

- Re-run the live Pi smoke after a funded provider key is available.
- Keep provider event diagnostics narrow and additive; if future harnesses
  expose similar event-level failures, normalize them into provider diagnostics
  rather than runtime-specific string parsing.
