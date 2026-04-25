# 030: Local Policy Engine

**Date:** 2026-04-25
**Phase:** Phase 06, sub-phase 06.4
**Commit:** same commit as this signpost

## What Changed

- Added source-level port label syntax: `Type [label.one, label.two]`.
- Added a runtime policy module for label inheritance, declassification checks,
  performed-effect validation, budgets, and idempotency-key records.
- Added optional `policy` records to newly materialized runtime run records.
- Propagated effective labels through provider requests, run outputs, and
  local artifact records.
- Blocked label lowering before provider execution unless `declassifies` is
  declared and approved.
- Failed runs when providers report undeclared or unapproved performed effects.
- Added tests for label parsing, propagation, declassification blocking,
  approved declassification, and performed-effect auditing.

## How To Test

- `bun test test/run-entrypoint.test.ts test/source-ir.test.ts test/provider-protocol.test.ts`
- `bunx tsc --noEmit`
- `bun test`

## Results

- Targeted policy/runtime/source tests passed: 33 tests across 3 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 137 tests, 1 skipped live smoke across 21 files.

## Next

- Phase 06.5: make evals executable over materialized runs.

## Risks Or Open Questions

- The OSS runtime records budgets and idempotency keys but does not yet enforce
  tenant-specific quotas.
- `policy` is optional on `RunRecord` so old fixture materializations remain
  readable while `prose run` writes the new policy shape.
- Declassification authorization currently uses approved `declassifies`; hosted
  runtimes should additionally enforce principal, org, and policy-rule scopes.
