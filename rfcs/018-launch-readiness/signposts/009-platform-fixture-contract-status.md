# Signpost 009: Platform Fixture Contract Status

## What Changed

- Updated `docs/what-shipped.md` and `docs/release-candidate.md` so they no longer describe platform hosted-runtime fixture consumption as future work.
- The docs now say the launch posture explicitly: platform tests should keep vendoring the OSS hosted-runtime fixtures so contract drift fails mechanically.

## Why

The platform branch already consumes `external/prose/fixtures/hosted-runtime` in runtime and registry tests. The OSS release docs should describe that current contract posture rather than teaching a stale follow-up.

## Validation

- `rg -n "platform tests that vendor|Wire platform tests directly" docs`
- `bun test test/docs-public.test.ts`
- `bun run typecheck`

## Next

- Continue to treat hosted-runtime fixture changes as a cross-repo contract event: update OSS fixtures, platform tests, and the hosted graph VM boundary together.
