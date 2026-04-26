# 038: Package Metadata

**Date:** 2026-04-26
**Phase:** Phase 08, sub-phase 08.1
**Commit:** `pending`

## What Changed

- Added package runtime metadata to `prose.package.json` and package IR
  manifests: supported providers and default provider.
- Extended package metadata with package IR version/hash details so hosted
  registry ingestion can pin the exact executable contract it is serving.
- Added package-level runtime summaries containing providers, required effects,
  and required environment bindings.
- Extended component metadata with component registry refs, required/optional
  port metadata, policy labels, artifact output contracts, and per-component
  runtime requirements.
- Updated hosted ingest metadata to contract version `0.2` with package IR and
  runtime fields.
- Added runtime provider metadata to examples, std, co, and the catalog-demo
  fixture package.
- Refreshed package IR goldens after manifest runtime metadata became semantic.

## How To Test

- `bun test test/package-registry.test.ts test/package-ir.test.ts`
- `bun run prose package fixtures/package/catalog-demo --format json`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted package registry and package IR tests passed: 24 tests.
- Strict examples, std, and co publish checks passed.
- Typecheck passed.
- Full test suite passed: 156 passed, 1 skipped.

## Next

- Phase 08.2: make remote execution wrap the real runtime store/envelope
  contract instead of a fixture-era envelope path.

## Risks Or Open Questions

- Provider metadata is declarative package intent. The CLI still needs a
  provider registry for non-fixture providers before `--provider pi` or
  `--provider local_process` can be configured entirely from the command line.
