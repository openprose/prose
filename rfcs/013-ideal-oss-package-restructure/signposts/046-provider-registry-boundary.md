# 046: Provider Registry Boundary

**Date:** 2026-04-26
**Phase:** Phase 04 follow-up, provider/runtime architecture

## What Changed

- Extracted runtime provider selection from `src/run.ts` into
  `src/providers/registry.ts`.
- Kept environment-backed provider configuration behind the provider module
  boundary:
  - fixture defaults when fixture outputs are supplied
  - Pi from `OPENPROSE_PI_*`
  - local-process from `OPENPROSE_LOCAL_PROCESS_*`
  - programmatic providers unchanged
- Exported the resolver from `src/providers/index.ts`.
- Added provider-registry unit tests for provider selection, environment
  parsing, invalid configuration, and unknown providers.
- Updated the Phase 04 plan with the provider-registry hardening slice.

## How To Test

- `bun test test/provider-registry.test.ts test/run-entrypoint.test.ts test/pi-provider.test.ts test/local-process-provider.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- `bun run confidence:runtime`
- `bun run typecheck`

## Result

- Targeted provider/runtime tests passed: 36 pass, 1 skipped live smoke.
- Full OSS suite passed: 170 pass, 1 skipped live smoke.
- Runtime confidence matrix passed: 15 checks.
- Typecheck passed.

## Next

- Continue reducing the size and responsibility of `src/run.ts` by extracting
  store writing, provider request rendering, or graph-node execution only when
  the extracted boundary can get direct tests.
- Re-run live Pi smoke once working provider credits are available; the
  provider registry now gives that smoke a clean configuration surface.
