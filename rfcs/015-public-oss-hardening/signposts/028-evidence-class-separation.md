# 028: Evidence Class Separation

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `docs: separate measurement evidence classes`

## What Changed

- Added an explicit `evidence` section to generated example measurements.
- Bumped the measurement report schema from `0.2` to `0.3`.
- Regenerated `docs/measurements/latest.*` and
  `docs/measurements/runtime-confidence.latest.*`.
- Added `docs/measurements/README.md` to explain stable local evidence versus
  opt-in live evidence.
- Updated `docs/measurement.md`, `test/measure-examples.test.ts`, and
  `scripts/runtime-confidence-matrix.ts` to make the distinction executable.

## Why

OpenProse needs both repeatable local confidence and live inference confidence.
Those are not the same artifact. Deterministic fixtures and scripted Pi runs
should be safe release gates; live Pi smoke should catch Pi SDK, model-provider,
billing, timeout, and structured-output interop without becoming a required
fixture for every contributor.

## How To Test

- `bun run measure:examples`
- `bun run confidence:runtime`
- `bun test test/measure-examples.test.ts test/docs-public.test.ts`
- `bun run typecheck`

## What Is Next

- Continue the API ergonomics queue: runtime-profile CLI flags, command error
  consistency, and final provider/node-runner vocabulary cleanup.
