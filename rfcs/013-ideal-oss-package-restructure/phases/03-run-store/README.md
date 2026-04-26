# Phase 03: Local Run And Artifact Store

Goal: replace loose run directories with a real local store model that mirrors
the hosted platform without requiring hosted infrastructure.

## 03.1 Define Store Layout, Versions, And Indexes

Build:

- Define `.prose/runs`, `.prose/artifacts`, `.prose/graphs`, `.prose/indexes`,
  and `.prose/meta` layouts.
- Add store version metadata and migration hooks.
- Build read/write APIs for immutable records and query indexes.

Tests:

- Add store layout goldens.
- Add migration/version tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: add local OpenProse run store`.

Signpost:

- Add `signposts/010-run-store-layout.md` with layout examples and migration
  expectations.

## 03.2 Model Artifacts As First-Class Records

Build:

- Add artifact records with content type, hash, byte size, schema status,
  policy labels, provenance, and storage location.
- Make artifacts addressable by run, node, output name, and content hash.

Tests:

- Add artifact write/read/hash tests.
- Add CLI trace/status fixtures for artifact summaries.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: add artifact records to local run store`.

Signpost:

- Add `signposts/011-artifact-records.md` with artifact examples and hosted
  parity notes.

## 03.3 Add Graph Node Current And Latest Pointers

Build:

- Track graph nodes separately from immutable runs.
- Add current/latest/failed/pending pointers.
- Update `status`, `trace`, and `graph` to read the store model.

Tests:

- Add pointer update tests.
- Add stale/current graph fixture tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run `bun bin/prose.ts status .prose/runs --format json` against a fixture
  store.

Commit:

- Commit as `feat: track graph node run pointers`.

Signpost:

- Add `signposts/012-graph-node-pointers.md` with pointer semantics and
  acceptance rules.

## 03.4 Record Attempts, Failures, Retries, And Resume Points

Build:

- Add attempt records under runs.
- Record provider session references, failure diagnostics, retry state, and
  resumable checkpoints.
- Ensure failed attempts never become current.

Tests:

- Add failure/retry/resume serialization tests.
- Add status rendering tests for failed attempts.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: record run attempts and resume points`.

Signpost:

- Add `signposts/013-run-attempts.md` with failure and retry examples.

## 03.5 Move Fixture Materialization Onto The Store

Build:

- Recast today's `materialize` behavior as a fixture provider writing through
  the store API.
- Keep fixture output deterministic for tests.
- Stop treating fixture materialization as the main runtime path.

Tests:

- Port current materialization tests to store-backed fixture tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run a fixture CLI smoke once `run --provider fixture` exists, or record why
  it is deferred to Phase 05.

Commit:

- Commit as `refactor: route fixture materialization through run store`.

Signpost:

- Add `signposts/014-fixture-store-provider.md` with old/new command mapping.

## 03.6 Project Attempts Into Trace Views

Build:

- Make `trace` read adjacent local-store attempt records when available.
- Project attempt number, status, session presence, diagnostic codes, and
  failure reason into the trace view.
- Keep loose run-directory trace loading working for old or exported runs that
  do not have an adjacent store.

Tests:

- Add trace view/text assertions for attempt summaries.
- Add CLI trace assertions that attempt context is visible.
- Run targeted trace/runtime tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: show attempts in trace views`.

Signpost:

- Add `signposts/047-trace-attempt-visibility.md` with the store lookup
  behavior and test results.

## 03.7 Project Artifacts Into Trace Views

Build:

- Make `trace` read adjacent local-store artifact records when available.
- Project artifact direction, port, node id, content hash, content type, schema
  status, policy labels, and storage path into the trace view.
- Render compact artifact summaries in CLI trace output.

Tests:

- Add trace view/text assertions for artifact summaries.
- Add CLI trace assertions that output artifact context is visible.
- Run targeted trace/artifact/runtime tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: show artifacts in trace views`.

Signpost:

- Add `signposts/048-trace-artifact-visibility.md` with the projected fields
  and test results.

## Phase Exit Criteria

- Every execution-like path writes through the same local store.
- Status, trace, graph, and future hosted envelopes can all read the same
  records.
- Old fixture materialization is a provider implementation detail.
