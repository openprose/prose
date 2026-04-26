# 040: Hosted Contract Fixtures

**Date:** 2026-04-26
**Phase:** Phase 08, sub-phase 08.3
**Commit:** `pending`

## What Changed

- Added vendorable hosted runtime fixtures under `fixtures/hosted-runtime/`.
- Snapshotted the package hosted-ingest contract for `@openprose/catalog-demo`.
- Snapshotted a deterministic successful remote runtime envelope, artifact
  manifest, run record, and plan.
- Added deterministic remote execution timestamps through `createdAt` and
  `completedAt` options so contract fixtures can be regenerated without
  machine-local timestamp drift.
- Added `test/hosted-contract-fixtures.test.ts` to regenerate the fixtures from
  the real package metadata and runtime kernel.

## How To Test

- `bun test test/hosted-contract-fixtures.test.ts`
- `bun test test/runtime-materialization.test.ts test/package-registry.test.ts test/hosted-contract-fixtures.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- From the platform repo: `pnpm --filter @openprose/api test -- openprose-runtime`

## Results

- Hosted fixture tests passed: 2 tests.
- Targeted package/runtime/hosted tests passed: 34 tests.
- Typecheck passed.
- Full OSS test suite passed: 158 tests passed, 1 skipped.
- Platform OpenProse runtime unit tests passed: 3 suites, 15 tests.

## Platform Handoff

- The platform can now vendor or snapshot:
  - `fixtures/hosted-runtime/package-hosted-ingest.json`
  - `fixtures/hosted-runtime/remote-envelope.success.json`
  - `fixtures/hosted-runtime/artifact-manifest.success.json`
  - `fixtures/hosted-runtime/run-record.success.json`
  - `fixtures/hosted-runtime/plan.success.json`
- Existing platform runtime tests pass, but they do not yet consume these OSS
  fixtures directly. Workstream 03 should add a cross-repo fixture contract test
  so platform envelope parsing, artifact ingestion, and package ingest fail
  fast when the OSS contract changes.

## Next

- Phase 08.4: polish CLI help, error, status, trace, graph, generated docs, and
  diagrams around the finalized runtime contract.

## Risks Or Open Questions

- The hosted fixture intentionally uses the fixture provider for determinism.
  A later platform-facing fixture should cover the local-process or Pi provider
  once provider session references and cost/telemetry fields stabilize.
