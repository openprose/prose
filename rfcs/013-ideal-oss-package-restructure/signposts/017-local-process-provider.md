# 017: Local Process Runtime Provider

**Date:** 2026-04-25
**Phase:** Phase 04, sub-phase 04.3
**Commit:** same commit as this signpost

## What Changed

- Added `LocalProcessProvider` implementing the OpenProse provider protocol.
- Added `createLocalProcessProvider` for local experiments and tests.
- Captured stdout, stderr, exit code, timeout state, duration, and workspace
  output files.
- Added pre-spawn blocking for missing required environment bindings and
  unapproved effects.
- Added command success, non-zero failure, and timeout tests.
- Documented local process semantics and limitations in
  `phases/04-provider-protocol/local-process-provider.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun test test/local-process-provider.test.ts test/fixture-provider.test.ts`

## Results

- Targeted local/fixture provider tests passed: 6 tests across 2 files.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 106 tests across 17 files.

## Next

- Phase 04.4: inspect and spike the Pi SDK integration.

## Risks Or Open Questions

- This provider is local-only and intentionally non-agentic.
- It is not sandboxed; safe hosted use would require a separate sandboxed
  process executor.
- Output capture is file-based by default. A later slice can add explicit
  stdout-to-port mapping if the meta-harness needs it.
