# 016: Fixture Runtime Provider

**Date:** 2026-04-25
**Phase:** Phase 04, sub-phase 04.2
**Commit:** same commit as this signpost

## What Changed

- Added a deterministic `FixtureProvider` implementing the OpenProse provider
  protocol.
- Added `createFixtureProvider` for tests and local runtime wiring.
- Added provider-result artifact store writing via
  `writeProviderArtifactRecords`.
- Added tests for successful fixture execution, missing required outputs, and
  malformed fixture outputs.
- Documented fixture authoring and failure semantics in
  `phases/04-provider-protocol/fixture-provider.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/fixture-provider.test.ts test/provider-protocol.test.ts`

## Results

- Targeted fixture/provider tests passed: 5 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 103 tests across 16 files.

## Next

- Phase 04.3: add the local process provider for explicitly non-agentic
  command-style experiments.

## Risks Or Open Questions

- Fixture execution is provider-only for now. The public `prose run --provider
  fixture` path arrives with the meta-harness in Phase 05.
- Fixture artifacts write through the provider artifact helper, but run records
  and attempts remain owned by the existing fixture materializer until the
  meta-harness takes over.
