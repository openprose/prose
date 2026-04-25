# 009: Meta-Operation Proposals

**Date:** 2026-04-25
**Phase:** Phase 02, sub-phase 02.5
**Commit:** same commit as this signpost

## What Changed

- Added durable meta-operation proposal types for intelligent wiring, contract
  repair, missing metadata, eval generation, and failure diagnosis.
- Added meta proposal helpers for normalization, accepted-state filtering,
  serialization, deserialization, and semantic projection.
- Added package compile options for accepted proposal inputs.
- Added `PackageIR.meta.accepted_proposals`.
- Made accepted graph-wiring proposals deterministic graph normalization input.
- Added a focused meta-proposals package fixture.
- Added tests proving pending/rejected proposals stay outside package IR while
  accepted wiring proposals add graph edges and alter package semantic hash.
- Documented the slice in
  `phases/02-ir-and-source-model/meta-proposals.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/meta-proposals.test.ts test/package-ir.test.ts`

## Results

- Targeted proposal/package IR tests passed: 8 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 86 tests across 10 files.

## Next

- Phase 03: build a real local run and artifact store so package IR and meta
  decisions have durable execution state to land in.

## Risks Or Open Questions

- Proposal production is not implemented yet. The current slice defines the
  durable contract and accepted deterministic behavior.
- Accepted wiring validates component ids but not type compatibility. That
  belongs with Phase 06 schema/policy/eval checks.
