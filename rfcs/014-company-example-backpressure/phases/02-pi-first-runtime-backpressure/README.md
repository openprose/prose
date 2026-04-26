# Phase 02: Pi-First Runtime Backpressure

Goal: align runtime contracts with the North Star before the larger examples
depend on them. This is the phase where OpenProse stops treating Pi as a
regular provider and starts treating Pi SDK as the default VM for reactive graph
execution.

## 02.1 Remove Flat Provider Semantics

Build:

- Remove public graph-runtime language that suggests `pi`, `openrouter`,
  `openai_compatible`, `opencode`, `codex_cli`, and `claude_code` are all the
  same kind of thing.
- Keep single-run harness portability as a separate source/runtime concept.
- Make OpenRouter and OpenAI-compatible endpoints model-provider choices
  inside the Pi-backed graph VM, not graph runtimes themselves.
- Keep any deterministic execution helpers internal to tests; do not expose
  `fixture` as a public runtime.

Tests:

- Update CLI UX tests for the new help text.
- Update old provider/protocol tests into runtime-layer tests.
- Add rejection tests for mixed concepts, such as selecting `openrouter` as a
  graph VM.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `refactor: clarify runtime layers`.

Signpost:

- Add `signposts/005-runtime-layer-boundary.md` with old names, new names,
  and platform follow-up notes.

## 02.1B Preserve Determinism As Test Infrastructure

Build:

- Move deterministic execution helpers into scripted Pi-session test support.
- Remove `fixture` from public runtime language.
- Ensure scripted sessions can emit lifecycle events, tool events, output
  submissions, model errors, timeouts, aborts, and retries.

Tests:

- Add scripted Pi helper tests.
- Migrate old runtime tests that only need determinism.
- Run `bun run typecheck`.

Commit:

- Commit as `test: replace fixture runtime with scripted pi sessions`.

Signpost:

- Add `signposts/006-scripted-pi-tests.md`.

## 02.2 Introduce Runtime Profiles

Build:

- Add a runtime profile shape that models:
  - single-run harness
  - reactive graph VM
  - model provider
  - model
  - thinking level
  - tools
  - session persistence
- Default reactive graph VM to Pi.
- Default session persistence to enabled.
- Make runtime profile data appear in run records and measurement output.
- Keep any deterministic execution helpers internal to tests.

Tests:

- Add runtime-profile parser tests.
- Add run-record tests proving runtime profile fields are materialized.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `refactor: introduce runtime profiles`.

Signpost:

- Add `signposts/007-runtime-profiles.md` with example local and live Pi
  profiles.

## 02.3 Make Pi The Reactive Graph VM

Build:

- Ensure reactive graph execution creates one Pi session per stale selected
  node.
- Persist Pi session files under the OpenProse run/store layout by default.
- Record Pi session refs in run attempts and traces.
- Make model provider/model explicit per run and per node override.
- Ensure reused/current nodes point to prior OpenProse materializations and do
  not create sessions.

Tests:

- Add scripted-Pi graph tests proving one session per executed node.
- Add selective recompute tests proving reused nodes do not create sessions.
- Add trace tests proving session refs are inspectable.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `feat: make pi the graph runtime vm`.

Signpost:

- Add `signposts/008-pi-graph-vm.md` with session layout and trace examples.

## 02.4 Define The Pi Node Prompt Envelope

Build:

- Create one prompt envelope builder for Pi graph nodes.
- Include component identity, typed inputs, upstream run refs, prior run refs,
  declared outputs, allowed effects, stale reason, acceptance criteria, and
  output-tool instructions.
- Ensure the envelope can be inspected in traces without leaking secret values.

Tests:

- Snapshot/semantic tests for simple, upstream-dependent, prior-run, and gated
  prompt envelopes.
- Redaction tests for secrets.
- Run `bun run typecheck`.
- Run focused runtime tests.

Commit:

- Commit as `feat: add pi node prompt envelope`.

Signpost:

- Add `signposts/009-pi-node-envelope.md` with a representative redacted
  prompt envelope.

## 02.5 Add Structured Output Submission

Build:

- Add an OpenProse Pi custom tool for structured output submission:
  `openprose_submit_outputs`.
- Let the model submit declared outputs, performed effects, and notes through
  the tool instead of relying only on file writes.
- Keep file output support as a fallback only if it does not complicate the
  primary path.

Tests:

- Unit test tool schema and result parsing.
- Scripted-Pi test for multi-output submission.
- Failure tests for missing required output, unknown output, malformed JSON,
  and undeclared effect.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `feat: add openprose pi output tool`.

Signpost:

- Add `signposts/010-pi-output-tool.md` with prompt/tool examples and failure
  modes.

## 02.6 Capture Runtime Telemetry

Build:

- Normalize Pi events into OpenProse trace events.
- Capture tool calls, model provider/model, token usage, cost, duration,
  session path, and failure class when available.
- Include telemetry in measurement reports.

Tests:

- Scripted event tests for tool start/end, model error, abort, retry, and
  successful assistant message.
- Trace renderer test for telemetry visibility.
- Run `bun run typecheck`.
- Run `bun test`.

Commit:

- Commit as `feat: record pi runtime telemetry`.

Signpost:

- Add `signposts/011-pi-telemetry.md` with a sample trace excerpt.

## 02.7 Gate Before Session Launch

Build:

- Ensure nodes requiring approval or forbidden effects block before Pi session
  creation.
- Record blocked node attempts as OpenProse run state with no Pi session ref.
- Make approvals visible to downstream Pi sessions only after they are granted.

Tests:

- Missing approval does not create a Pi session.
- Approval creates a new attempt with a Pi session.
- Forbidden effects fail before session launch.
- Trace explains the blocking policy.
- Run `bun run typecheck`.
- Run policy/runtime tests and full `bun test`.

Commit:

- Commit as `test: enforce pre-session gates`.

Signpost:

- Add `signposts/012-pre-session-gates.md`.
