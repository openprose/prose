# Fixture Store Provider Slice

**Date:** 2026-04-25
**Phase:** 03.5 Move Fixture Materialization Onto The Store

Fixture materialization now writes through the local store APIs while preserving
the existing inspectable run-directory files.

## What Writes Through The Store

Each fixture materialization now records:

- run index entries for graph and component runs
- attempt records for each run
- graph node pointers for component runs
- artifact records for caller inputs and run outputs

The existing `run.json`, `nodes/*.run.json`, `trace.json`, `manifest.md`, and
binding files still exist for compatibility with current trace/status fixtures.
The runtime path is now store-backed enough for later provider work to replace
fixture output production without changing store contracts.

## Store Root Behavior

When `runRoot` ends in `runs`, the store root is its parent directory. This is
the canonical `.prose/runs` -> `.prose` case.

When callers pass an arbitrary run root, fixture materialization writes store
records under `<runRoot>/.prose-store` so old loose-run status behavior remains
available for existing tests and scripts.

## Deferred CLI

`prose run --provider fixture` is deferred to Phase 05. The current command
remains:

```text
prose fixture materialize <file.prose.md>
```

This keeps fixture materialization explicitly marked as a provider-like testing
path rather than the main runtime surface.

## Current Gaps

- The fixture path still receives outputs from CLI/test inputs. It does not run
  an agent harness.
- Trace still reads legacy run-directory files. Future store-backed trace should
  consume run, attempt, artifact, and pointer records directly.
- The meta-harness will eventually own provider selection, scheduling, retries,
  acceptance, and current pointer updates.
