# 023: Upstream Binding

**Date:** 2026-04-25
**Phase:** Phase 05, sub-phase 05.3
**Commit:** same commit as this signpost

## What Changed

- Populated provider request `input_bindings` from upstream node outputs.
- Attached local artifact records and `source_run_id` provenance to downstream
  provider inputs.
- Populated provider request `upstream_artifacts`.
- Blocked downstream provider calls when required upstream outputs are missing.
- Preserved `run<T>` caller input provenance from `run: {id}` values.
- Rendered OpenProse input bindings in Pi provider prompts.
- Added tests for upstream artifact propagation and run-reference provenance.
- Documented the slice in `phases/05-meta-harness/upstream-binding.md`.

## How To Test

- `bun test test/run-entrypoint.test.ts`
- `bun test test/pi-provider.test.ts test/run-entrypoint.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- Manual run-aware smoke:
  `bun bin/prose.ts run examples/run-aware-brief.prose.md --provider fixture --input company='OpenProse profile.' --input subject='run: intake-123' --output brief-writer.brief='Run-aware brief.'`

## Results

- Targeted run entrypoint tests passed: 8 tests across 1 file.
- Pi plus run entrypoint tests passed: 12 tests, 1 skipped live smoke across 2
  files.
- `bunx tsc --noEmit` passed.
- Manual run-aware smoke passed and produced a succeeded graph run with `brief`.
- `bun test` passed: 118 tests, 1 skipped live smoke across 19 files.

## Next

- Phase 05.4: enforce effect gates before provider calls with explicit approval
  records and resumable human gates.

## Risks Or Open Questions

- This slice uses `run: {id}` as the explicit local syntax for run references.
  A richer resolver can layer on later without changing the provider contract.
- Pi now sees input bindings in prompt text. Local-process providers still
  consume request state programmatically rather than through an automatic
  request file; that may be worth tightening when CLI adapters return.
