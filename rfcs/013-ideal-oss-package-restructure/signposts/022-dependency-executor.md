# 022: Dependency Executor

**Date:** 2026-04-25
**Phase:** Phase 05, sub-phase 05.2
**Commit:** same commit as this signpost

## What Changed

- Extended `prose run` to execute multi-node graphs in dependency order.
- Added current-run loading to the run path so valid graph runs can be reused
  without selecting a provider.
- Materialized node run records as `{graph_run_id}:{component_name}`.
- Assembled graph run records from node outputs.
- Wrote graph/node attempts, run index entries, graph-node pointers, caller
  input artifacts, and graph output artifacts to the local store.
- Recorded upstream output hashes and source run ids in downstream node input
  records once those upstream nodes have materialized.
- Added CLI support for `--current-run` and `--target-output` on `prose run`.
- Exported `loadCurrentRunSet` and `CurrentRunSet` from the runtime namespace.
- Added targeted graph execution, blocked-plan, and current-reuse tests.
- Documented the slice in `phases/05-meta-harness/dependency-executor.md`.

## How To Test

- `bun test test/run-entrypoint.test.ts`
- `bunx tsc --noEmit`
- `bun test`
- Manual graph smoke:
  `bun bin/prose.ts run fixtures/compiler/pipeline.prose.md --provider fixture --input draft='Smoke draft.' --output review.feedback='Needs less fog.' --output fact-check.claims='Claims verified.' --output polish.final='Polished smoke draft.'`

## Results

- Targeted run entrypoint tests passed: 6 tests across 1 file.
- `bunx tsc --noEmit` passed.
- Manual graph smoke passed and produced a succeeded graph run with `final`.
- `bun test` passed: 116 tests, 1 skipped live smoke across 19 files.

## Next

- Phase 05.3: propagate upstream run artifacts into downstream provider
  requests, including `run<T>` references and artifact provenance.

## Risks Or Open Questions

- Provider requests still receive null upstream artifact bindings; this is the
  explicit handoff into 05.3.
- Current-node reuse is correct for full current graphs. Partial reuse that must
  copy artifacts from a previous run directory will be completed with upstream
  artifact propagation.
- Graph assembly now updates current pointers for every node record it sees.
  Phase 05.6 will tighten pointer updates around acceptance and rejected runs.
