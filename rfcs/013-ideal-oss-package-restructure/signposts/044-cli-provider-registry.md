# 044: CLI Provider Registry

**Date:** 2026-04-26
**Phase:** Phase 08 follow-up, provider/runtime hardening

## What Changed

- Promoted the CLI provider selector from fixture-only into a small
  environment-backed provider registry.
- `prose run --provider pi` now instantiates the Pi provider from
  `OPENPROSE_PI_*` configuration instead of failing as unregistered.
- `prose run --provider local_process` and `--provider local-process` now
  instantiate the local-process provider from `OPENPROSE_LOCAL_PROCESS_*`
  configuration.
- Kept fixture as the deterministic default/test provider.
- Updated CLI help to point users at provider environment configuration.
- Added a CLI regression test proving the Pi provider can be selected before
  execution; missing graph inputs still block before any provider call.
- Refreshed the runtime confidence report after the slice.

## How To Test

- `bun test test/run-entrypoint.test.ts test/pi-provider.test.ts test/local-process-provider.test.ts test/cli-ux.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- `bun run confidence:runtime`
- `bun run typecheck`

## Result

- Targeted provider/CLI tests passed: 31 pass, 1 skip.
- Typecheck passed.
- Full OSS suite passed: 162 pass, 1 skip.
- Runtime confidence matrix passed: 15 checks.

## Next

- Run an opt-in live Pi smoke once model credentials and cost posture are
  intentionally enabled for the local environment.
- Keep hosted/platform adaptation aligned to the provider names and run
  envelope fields now emitted by the OSS runtime.
