# 000: Phase Plan Tree

**Date:** 2026-04-25
**Phase:** RFC 013 planning
**Commit:** pending

## What Changed

- Split RFC 013 into eight implementation phases.
- Added sub-phase plans for contract baseline, IR, run store, provider
  protocol, meta-harness, types/policy/evals, std/examples migration, and
  package UX/release readiness.
- Added explicit test, commit, and signpost expectations for every sub-phase.
- Recorded the Pi SDK as the default real provider path while preserving the
  provider boundary so OpenProse does not become Pi-specific.
- Updated RFC 013 to point at the phase tree and replace obsolete open provider
  questions with decisions carried into the plan.

## How To Test

- `bun test`
- `bunx tsc --noEmit`

## Results

- `bun test` passed: 69 tests.
- `bunx tsc --noEmit` passed.

## Next

- Begin Phase 01.1 by inventorying current runtime contracts and deletion
  candidates.

## Risks Or Open Questions

- The Pi SDK spike may reveal constraints that require a different default real
  provider. The core provider protocol should absorb that without changing IR
  or run records.
