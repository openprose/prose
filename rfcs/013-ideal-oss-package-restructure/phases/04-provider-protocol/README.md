# Phase 04: Provider Protocol And Pi SDK Default Path

Goal: make harness sessions pluggable behind one TypeScript provider protocol,
with the Pi SDK as the default real provider target.

## 04.1 Define The Provider Interface

Build:

- Define provider inputs: component IR, rendered contract, input bindings,
  upstream run artifacts, workspace path, environment names, approved effects,
  policy labels, expected outputs, and validation rules.
- Define provider outputs: status, artifacts, performed effects, logs,
  diagnostics, provider session refs, cost, and duration.
- Keep provider records generic enough for Pi, OpenCode, Codex CLI, Claude
  Code, local process, and fixture providers.

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

## 04.2 Implement Fixture Provider

Build:

- Implement a deterministic fixture provider using the protocol.
- Use it for fast local tests and golden fixtures.
- Ensure it exercises the same store write path as real providers.

Tests:

- Add fixture provider success, missing output, and malformed output tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.

Commit:

- Commit as `feat: add fixture runtime provider`.

Signpost:

- Add `signposts/016-fixture-provider.md` with fixture authoring rules.

## 04.3 Implement Local Process Provider

Build:

- Add a simple local process provider for command-style experiments.
- Capture stdout, stderr, exit code, duration, and output files.
- Keep this provider explicitly non-agentic.

Tests:

- Add command success/failure/timeouts tests.
- Run `bun test`.
- Run `bunx tsc --noEmit`.
- Run a local process smoke with a temporary fixture component.

Commit:

- Commit as `feat: add local process runtime provider`.

Signpost:

- Add `signposts/017-local-process-provider.md` with safety limitations and
  local-only expectations.

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

## Phase Exit Criteria

- The provider protocol is stable enough for the meta-harness.
- Fixture and local process providers work without credentials.
- Pi is either implemented as the default real provider or explicitly rejected
  with a documented alternate plan.
