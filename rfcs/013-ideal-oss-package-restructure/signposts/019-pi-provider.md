# 019: Pi SDK Alpha Provider

**Date:** 2026-04-25
**Phase:** Phase 04, sub-phase 04.5
**Commit:** same commit as this signpost

## What Changed

- Added `@mariozechner/pi-coding-agent@0.70.2` as the first real harness
  dependency.
- Added `PiProvider`, `createPiProvider`, and `renderPiPrompt`.
- Added shared output-file helpers used by both the local process provider and
  Pi provider.
- Added fake-session Pi provider unit tests for successful artifact capture,
  missing output failures, prompt errors, and prompt rendering.
- Added an opt-in live Pi SDK smoke gated by `OPENPROSE_PI_INTEGRATION=1`.
- Documented setup, execution shape, and limitations in
  `phases/04-provider-protocol/pi-provider.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/pi-provider.test.ts test/local-process-provider.test.ts`
- Optional live smoke:
  `OPENPROSE_PI_INTEGRATION=1 OPENPROSE_PI_MODEL_PROVIDER=anthropic OPENPROSE_PI_MODEL_ID=<model> OPENPROSE_PI_API_KEY=<key> bun test test/pi-provider.test.ts`

## Results

- Targeted Pi/local provider tests passed: 7 tests, 1 skipped live smoke across
  2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 110 tests, 1 skipped live smoke across 18 files.
- `bun pm untrusted` reports blocked lifecycle scripts for transitive Pi
  dependencies `koffi` and `protobufjs`; the alpha provider tests do not need
  those scripts trusted.

## Next

- Phase 04.6: consider thin one-off adapters only if they satisfy the provider
  protocol cleanly.

## Risks Or Open Questions

- Pi’s SDK returns session state, not typed artifacts; OpenProse currently
  enforces file outputs.
- The dependency is large because Pi includes many model providers. This is
  acceptable for the alpha provider, but package release work should revisit
  whether Pi stays a direct dependency or becomes an optional provider bundle.
- Hosted runtime may use Pi directly, Pi inside Sprites, or a separate provider.
  That decision remains platform-specific and should not distort OSS core
  semantics.
