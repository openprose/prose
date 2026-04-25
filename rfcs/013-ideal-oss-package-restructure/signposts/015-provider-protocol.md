# 015: Provider Protocol

**Date:** 2026-04-25
**Phase:** Phase 04, sub-phase 04.1
**Commit:** same commit as this signpost

## What Changed

- Added the canonical OpenProse provider protocol in `src/providers`.
- Defined provider request shapes for component IR, rendered contracts, input
  bindings, upstream artifacts, workspaces, environment bindings, effects,
  policy labels, expected outputs, and validation rules.
- Defined provider result shapes for status, artifacts, performed effects,
  logs, diagnostics, session refs, cost, and duration.
- Added stable provider session reference serialization helpers.
- Added provider protocol tests for typed request/result construction and
  stable session serialization.
- Documented the provider boundary in
  `phases/04-provider-protocol/provider-protocol.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/provider-protocol.test.ts`

## Results

- Targeted provider protocol tests passed: 2 tests across 1 file.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 100 tests across 15 files.

## Next

- Phase 04.2: implement the deterministic fixture runtime provider using this
  protocol.

## Risks Or Open Questions

- The protocol is intentionally generic until fixture, local process, and Pi
  providers put pressure on it.
- Provider outputs are not yet materialized through the meta-harness; that
  starts in Phase 05.
