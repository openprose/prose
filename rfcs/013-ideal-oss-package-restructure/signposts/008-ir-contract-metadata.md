# 008: Package IR Contract Metadata

**Date:** 2026-04-25
**Phase:** Phase 02, sub-phase 02.4
**Commit:** same commit as this signpost

## What Changed

- Added package resources for manifest-declared schemas, evals, and examples.
- Added package policy projection for effects, access rules, and labels.
- Added split package hashes: source, semantic, dependency, policy, and runtime
  config.
- Kept top-level `PackageIR.semantic_hash` equal to
  `PackageIR.hashes.semantic_hash`.
- Added a focused contract-metadata package fixture.
- Updated package IR goldens to include resources, policy summaries, and hash
  sets.
- Added regression coverage proving formatting-only source churn changes
  `source_hash` while preserving package `semantic_hash`.
- Documented the slice in
  `phases/02-ir-and-source-model/ir-contract-metadata.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts publish-check packages/std --strict`
- `bun bin/prose.ts compile fixtures/package-ir/contract-metadata --no-pretty >/tmp/openprose-phase-02-4-contract-metadata.json`

## Results

- `bun test` passed: 84 tests across 9 files.
- `bunx tsc --noEmit` passed.
- `bun bin/prose.ts publish-check packages/std --strict` passed.
- The contract-metadata package compile smoke passed.

## Next

- Phase 02.5: model intelligent meta-operation proposals as explicit records
  that can be accepted into deterministic graph normalization.

## Risks Or Open Questions

- `prose package` still has an older metadata builder. It should become a
  projection of package IR so registry metadata, compile output, and hosted
  ingest cannot drift.
- Port-level policy label syntax is still thin. Current package policy is good
  enough for access/effect hashing, but Phase 06 should make label propagation
  operational.
