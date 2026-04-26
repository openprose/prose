# Phase 02 Implementation Guide

Phase 02 is the architectural turn. Its goal is to replace the old provider
experiment with a Pi-backed graph VM that feels like the natural core of
OpenProse.

## 02.1A Inventory And Delete Public Provider Entrypoints

Original files to inspect during the deletion slice:

- `src/providers/protocol.ts`
- `src/providers/registry.ts`
- `src/providers/index.ts`
- `src/cli.ts`
- `src/remote.ts`
- `src/ir/package.ts`
- `examples/prose.package.json`
- `packages/std/prose.package.json`
- `packages/co/prose.package.json`

Implementation:

- Remove public CLI help that teaches `--provider fixture`.
- Remove `fixture` as a top-level command or mark it for deletion in the same
  branch if tests are not yet migrated.
- Remove `openrouter`, `openai_compatible`, and `local_process` from graph
  runtime selection.
- Replace provider-list package metadata with runtime requirement/profile
  metadata.

Tests:

- Update CLI UX tests so `--provider fixture` is no longer documented.
- Add tests that selecting `openrouter` as a graph VM fails with a helpful
  model-provider-vs-graph-VM explanation.
- Run `bun run typecheck`.
- Run focused CLI/package tests.

Commit:

- `refactor: remove public provider runtime surface`

Signpost:

- `signposts/005-runtime-layer-boundary.md`

## 02.1B Preserve Determinism As Test Infrastructure

Files to create:

- `test/support/scripted-pi-session.ts`
- `test/support/runtime-scenarios.ts`

Implementation:

- Move deterministic output scripting into Pi-session-shaped test helpers.
- Ensure the helper emits realistic Pi lifecycle/tool events.
- Replace tests that pass old fixture runtime options with injected scripted Pi
  graph runtime/session factories.

Tests:

- Scripted success, missing output, malformed output, model error, timeout,
  abort, and retry tests.
- Run focused runtime tests.
- Run `bun run typecheck`.

Commit:

- `test: replace fixture runtime with scripted pi sessions`

Signpost:

- `signposts/006-scripted-pi-tests.md`

## 02.2 Runtime Profiles

Files to create or reshape:

- `src/runtime/profiles.ts`
- `src/runtime/index.ts`
- `src/types.ts`
- `src/ir/package.ts`

Implementation:

- Define runtime axes separately:
  - `singleRunHarness`
  - `graphVm`
  - `modelProvider`
  - `model`
  - `thinking`
  - `tools`
  - `persistSessions`
- Default graph VM to `pi`.
- Default session persistence to enabled.
- Record runtime profile fields on run records and attempts.
- Remove `providers` / `default_provider` from package runtime metadata in
  favor of runtime requirements or examples of profile hints.

Tests:

- Runtime profile parser tests.
- Package metadata tests proving old provider lists are gone.
- Run-record tests proving graph VM/model provider/model are recorded.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- `refactor: introduce openprose runtime profiles`

Signpost:

- `signposts/007-runtime-profiles.md`

## 02.3 Pi Graph VM Boundary

Files to create or reshape:

- `src/runtime/graph-runtime.ts`
- `src/runtime/node-request.ts`
- `src/runtime/node-result.ts`
- `src/runtime/pi/graph-vm.ts`
- `src/runtime/pi/session-factory.ts`
- `src/run.ts`

Implementation:

- Replace old runtime-provider execution inside graph execution with a
  `ReactiveGraphRuntime.executeNode(request)` boundary.
- Make the Pi graph VM execute each stale selected node.
- Persist one Pi session per executed node under the OpenProse run directory.
- Reused/current nodes must not create Pi sessions.

Tests:

- Multi-node graph creates one session per ready node.
- Selective recompute creates sessions only for stale selected nodes.
- Current graph returns prior materializations without sessions.
- Run `bun run typecheck`.
- Run focused graph runtime tests and `bun test`.

Commit:

- `feat: execute graph nodes through pi vm`

Signpost:

- `signposts/008-pi-graph-vm.md`

## 02.4 Pi Node Prompt Envelope

Files to create:

- `src/runtime/node-envelope.ts`
- `src/runtime/pi/prompt.ts`

Implementation:

- Build a deterministic prompt envelope containing:
  - component identity
  - typed inputs
  - upstream run refs and artifact summaries
  - prior materialization refs
  - declared outputs and schemas
  - allowed and forbidden effects
  - stale reason/recompute scope
  - acceptance criteria
  - `openprose_submit_outputs` instructions
- Redact environment values and secrets from persisted envelope traces.

Tests:

- Prompt envelope semantic snapshots for:
  - single node
  - upstream-dependent node
  - prior-run-aware node
  - gated node
- Redaction tests.
- Run `bun run typecheck`.

Commit:

- `feat: add pi node prompt envelope`

Signpost:

- `signposts/009-pi-node-envelope.md`

## 02.5 Structured Output Tool

Files to create:

- `src/runtime/output-submission.ts`
- `src/runtime/pi/output-tool.ts`

Implementation:

- Add `openprose_submit_outputs` as a Pi `defineTool` custom tool.
- Capture typed output values/artifact refs, performed effects, citations, and
  notes.
- Return `terminate: true` when the submission is valid and complete.
- Treat file writes as scratch effects, not primary output submission.

Tests:

- Tool schema test.
- Required output missing fails.
- Unknown output fails.
- Malformed JSON fails.
- Undeclared performed effect fails.
- Multi-output submission succeeds.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- `feat: add openprose pi output tool`

Signpost:

- `signposts/010-pi-output-tool.md`

## 02.6 Telemetry And Trace Normalization

Files to create or reshape:

- `src/runtime/pi/events.ts`
- `src/runtime/traces.ts`
- `src/trace.ts`

Implementation:

- Normalize Pi events into OpenProse events:
  - session start/end
  - graph VM, model provider, and model id
  - assistant message
  - tool start/end
  - output submission
  - abort
  - retry
  - error/failure class
  - token/cost/duration when available
- Store session refs on attempts.
- Render telemetry in trace views.

Tests:

- Event normalization tests.
- Trace view includes session path, model provider/model, tool events, and
  failure class.
- Run `bun run typecheck`.
- Run focused trace tests and `bun test`.

Commit:

- `feat: normalize pi runtime traces`

Signpost:

- `signposts/011-pi-telemetry.md`

## 02.7 Pre-Session Gates

Files to inspect:

- `src/plan.ts`
- `src/run.ts`
- `src/policy/*`

Implementation:

- Ensure missing approvals and forbidden effects block before Pi session
  creation.
- Materialize blocked run records with no Pi session ref.
- Resume from approval records into a new run/attempt.

Tests:

- Missing approval creates no session.
- Approval creates session.
- Forbidden effect creates no session.
- Trace explains the gate.
- Run `bun run typecheck`.
- Run policy/runtime tests and `bun test`.

Commit:

- `test: enforce graph gates before pi sessions`

Signpost:

- `signposts/012-pre-session-gates.md`
