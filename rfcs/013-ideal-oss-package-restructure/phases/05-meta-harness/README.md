# Phase 05: Meta-Harness And Reactive Execution

Goal: build the runtime OpenProse actually owns: a coordinator that turns a
reactive plan into many provider-backed component sessions.

## 05.1 Add `prose run` As The Runtime Entry Point

Build:

- Implement `prose run` as compile -> plan -> execute -> store -> report.
- Support explicit provider selection.
- Default to fixture provider only when fixtures are present or explicitly
  requested; avoid pretending fixture output is a real run.

Tests:

- Add CLI smoke tests for `prose run --provider fixture`.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: add prose run entry point`.

Signpost:

- Add `signposts/021-prose-run-entrypoint.md` with CLI examples and provider
  defaults.

## 05.2 Execute Nodes In Dependency Order

Build:

- Convert reactive plans into dependency-ordered execution queues.
- Reuse current runs where valid.
- Block on missing inputs, unsafe effects, or failed upstreams.

Tests:

- Add multi-node graph execution tests using fixture provider.
- Add current/reuse/block tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: execute OpenProse graphs in dependency order`.

Signpost:

- Add `signposts/022-dependency-executor.md` with scheduling rules and edge
  cases.

## 05.3 Propagate Upstream Runs And Outputs Downstream

Build:

- Bind downstream inputs from upstream artifact outputs and `run<T>` references.
- Preserve provenance for every propagated value.
- Fail clearly when a required upstream output is missing or invalid.

Tests:

- Add run-reference binding tests.
- Add output propagation tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run a fixture smoke for `examples/run-aware-brief.prose.md`.

Commit:

- Commit as `feat: propagate upstream runs through graph execution`.

Signpost:

- Add `signposts/023-upstream-binding.md` with binding examples and failure
  modes.

## 05.4 Enforce Effect Gates Before Provider Calls

Build:

- Require approval records before unsafe effects execute.
- Pause runs at human gates and persist resumable state.
- Pass approved effect scopes into provider requests.

Tests:

- Add approval-required, approval-present, and denied-effect tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run a fixture smoke for `examples/approval-gated-release.prose.md`.

Commit:

- Commit as `feat: gate runtime effects before provider execution`.

Signpost:

- Add `signposts/024-effect-gates.md` with approval record shape and resume
  behavior.

## 05.5 Add Retry, Cancel, And Resume Semantics

Build:

- Add runtime controls for retrying failed nodes, cancelling graph runs, and
  resuming blocked or interrupted runs.
- Record attempt lineage and provider session refs.

Tests:

- Add retry/cancel/resume tests against fixture provider.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: add retry cancel and resume runtime controls`.

Signpost:

- Add `signposts/025-runtime-control.md` with command examples and known
  limitations.

## 05.6 Assemble Graph Runs And Update Current Pointers

Build:

- Write graph run records that aggregate node runs, skipped nodes, blocked
  nodes, and provider telemetry.
- Update current/latest pointers only after validation and required acceptance.
- Keep rejected or failed runs queryable but non-current.

Tests:

- Add graph run assembly tests.
- Add current pointer acceptance tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: assemble graph runs with current pointer updates`.

Signpost:

- Add `signposts/026-graph-run-assembly.md` with acceptance rules and examples.

## 05.7 Extract Runtime Binding Boundary

Build:

- Move upstream artifact binding, caller input binding, run-reference
  validation, and provider artifact schema validation out of the top-level run
  coordinator.
- Keep the helper internal to the runtime package boundary unless a later API
  review decides these contracts should be public.
- Preserve `prose run` behavior exactly.

Tests:

- Run strict source unused-symbol scan for `src/`.
- Run focused run-entrypoint, planning, and artifact-store tests.
- Run `bun run typecheck`.
- Run `bun test`.
- Run `bun run confidence:runtime`.

Commit:

- Commit as `refactor: extract runtime binding helpers`.

Signpost:

- Add `signposts/050-runtime-binding-boundary.md` with the module boundary and
  checks.

## Phase Exit Criteria

- `prose run` can execute at least one multi-node graph locally.
- Fixture runs and real provider runs use the same runtime path.
- The runtime can pause, resume, retry, and preserve provenance.
