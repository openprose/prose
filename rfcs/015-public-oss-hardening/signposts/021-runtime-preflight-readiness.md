# Signpost 021: Runtime Preflight Readiness

Date: 2026-04-26
Branch: `rfc/reactive-openprose`

## What Changed

- Added runtime-profile readiness to `preflightPath`.
- Preflight now reports:
  - scripted Pi readiness
  - live model-provider/model profile readiness
  - live auth readiness without printing secret values
  - Pi session persistence mode
  - Pi node timeout configuration
- Missing live Pi credentials are advisory; preflight still passes when the
  source graph, dependencies, and declared environment are ready for
  deterministic scripted-Pi execution.
- Updated `commands/prose-preflight.md`, `docs/what-shipped.md`, and
  `docs/inference-examples.md`.
- Added focused tests for runtime checks and secret redaction.

## Validation

- `bun test test/source-tooling.test.ts test/runtime-profiles.test.ts test/cli-ux.test.ts`
- `bun run prose preflight examples/north-star/lead-program-designer.prose.md`
- `bun run typecheck`
- `git diff --check`

## Next

- Continue with Pi session persistence visibility in run records/traces and
  docs, since preflight now names the expected session storage mode.
