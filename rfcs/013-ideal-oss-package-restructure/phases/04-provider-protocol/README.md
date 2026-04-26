# Phase 04: Historical Provider Protocol And Pi SDK Path

**Status:** historical and superseded in vocabulary.

This phase records the path that led to the current runtime. Do not implement
new flat providers from this document. The active architecture is:

- Pi is the graph VM.
- Node runners execute individual graph nodes.
- Model providers, including OpenRouter, are configured inside the Pi runtime
  profile.
- Deterministic `--output` values use a scripted Pi-shaped node runner for
  tests and hosted fixtures.

Goal: make node execution pluggable behind one TypeScript protocol, with the
Pi SDK as the default real graph VM substrate.

## 04.1 Define The Provider Interface

Build:

- Define provider inputs: component IR, rendered contract, input bindings,
  upstream run artifacts, workspace path, environment names, approved effects,
  policy labels, expected outputs, and validation rules.
- Define provider outputs: status, artifacts, performed effects, logs,
  diagnostics, provider session refs, cost, and duration.
- Keep execution records generic enough for Pi, future OpenCode/Codex
  CLI/Claude Code single-run adapters, and internal scripted Pi sessions.

Tests:

- Add TypeScript contract tests or compile-time fixture tests for provider
  request/response shapes.
- Add serialization tests for provider session references.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: define OpenProse provider protocol`.

Signpost:

- Add `signposts/015-provider-protocol.md` with provider contract examples and
  fields intentionally left optional.

## 04.2 Implement Scripted Pi Determinism

Build:

- Implement deterministic scripted Pi sessions using the protocol.
- Use them for fast local tests, deterministic `--output`, and golden
  fixtures.
- Ensure they exercise the same store write path as real Pi execution.

Tests:

- Add scripted Pi success, missing output, malformed output, model error, and
  timeout tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `test: add scripted pi runtime support`.

Signpost:

- Add `signposts/016-scripted-pi-scenarios.md` with deterministic-runtime
  authoring rules.

## 04.3 Superseded: Local Process Provider

Build:

- Do not keep a local process provider in the ideal package. It was useful
  scaffolding, but it is not an agent harness and it teaches the wrong runtime
  abstraction.
- Revisit command-style execution later only if it becomes a clearly-scoped
  single-run harness adapter.

Tests:

- Remove local process provider tests when the adapter is deleted.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: remove local process runtime adapter`.

Signpost:

- Add a signpost explaining why the adapter was removed instead of preserved
  as legacy substrate.

## 04.4 Spike The Pi SDK Integration

Build:

- Inspect the Pi SDK API and examples.
- Create a throwaway or quarantined spike proving OpenProse can start a Pi
  harness session, provide a contract, receive outputs, and capture telemetry.
- Record mismatches between Pi concepts and OpenProse provider concepts.

Tests:

- Run any Pi SDK local tests or sample commands available.
- Add a skipped or opt-in integration test if credentials or network are
  required.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `spike: evaluate Pi SDK as OpenProse provider`.

Signpost:

- Add `signposts/018-pi-sdk-spike.md` with the recommendation: continue,
  adapt, or choose a different default provider.

## 04.5 Implement Pi SDK Alpha Provider

Build:

- Wrap Pi as the first real TypeScript provider if the spike is positive.
- Map OpenProse requests to Pi sessions without leaking Pi-specific concepts
  into IR or run records.
- Add provider configuration and environment validation.

Tests:

- Add unit tests for request/response mapping.
- Add opt-in integration smoke for a minimal `hello` component.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run the integration smoke when credentials are available.

Commit:

- Commit as `feat: add Pi SDK runtime provider`.

Signpost:

- Add `signposts/019-pi-provider.md` with setup instructions, integration
  status, and limitations.

## 04.6 Add Optional One-Off Provider Adapters

Build:

- Add thin adapters for Codex CLI, Claude Code, or OpenCode only if they can
  satisfy the provider protocol without distorting core runtime semantics.
- Keep them optional and clearly provider-scoped.

Tests:

- Add mapping tests for each adapter.
- Add opt-in smoke tests where local CLIs are installed.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit each adapter separately, for example
  `feat: add Codex CLI runtime provider`.

Signpost:

- Add one signpost per adapter with installation requirements and gaps.

## 04.7 Harden The Provider Registry

Build:

- Keep provider selection and environment parsing inside the provider module
  boundary rather than in the meta-harness executor.
- Support deterministic scripted Pi defaults, env-backed Pi, and programmatic
  test providers through one resolver.
- Preserve helpful configuration errors for CLI users.

Tests:

- Add provider-registry unit tests for scripted Pi defaults, programmatic
  providers, Pi env configuration, invalid env values, and unknown graph VM
  names.
- Run targeted provider/runtime tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `refactor: extract runtime provider registry`.

Signpost:

- Add `signposts/046-provider-registry-boundary.md` with the moved boundary,
  test results, and next architecture cleanup.

## Phase Exit Criteria

- The provider protocol is stable enough for the meta-harness.
- Scripted Pi works without credentials for deterministic tests.
- Pi is implemented as the default real graph VM substrate.
