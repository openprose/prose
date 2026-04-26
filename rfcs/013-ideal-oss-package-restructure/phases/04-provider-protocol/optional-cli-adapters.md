# Optional CLI Provider Adapters

Phase 04.6 evaluated Codex CLI, Claude Code, and OpenCode as optional one-off
provider adapters.

## Local Availability Checked

Observed local commands:

- `codex`
- `claude`
- `opencode`
- `pi`

Each can run in a non-interactive or headless mode:

- `codex exec`
- `claude --print`
- `opencode run`
- `pi -p`

## Decision

Do not add dedicated one-off CLI adapters yet.

The package now has:

- internal scripted Pi sessions for deterministic tests
- `PiProvider` for the TypeScript graph VM substrate

Adding `CodexCliProvider`, `ClaudeCodeProvider`, or `OpenCodeProvider` before
their SDK/process boundaries can satisfy the node execution contract would
introduce weaker and less consistent semantics for:

- durable session references
- structured transcript capture
- cost telemetry
- auth discovery
- resume behavior
- output-file enforcement
- effect-to-tool mapping

The better sequence is to keep Pi as the graph VM, then add single-run harness
adapters only when they can be thin, well-tested wrappers that do not distort
the graph runtime.

## Future Adapter Requirements

A CLI adapter is acceptable only if it can:

- receive the rendered OpenProse contract plus output-file instructions
- run without an interactive prompt
- execute inside a prepared workspace
- keep output artifacts file-based and validated
- return provider session refs that can be inspected or resumed
- capture stdout/stderr/transcript without brittle parsing
- avoid shell interpolation by default
- respect effect gates through tool flags or sandbox settings
- run in opt-in integration tests without disturbing normal CI

## Backpressure

This slice is complete when:

- the deferral is explicit
- the reasons are concrete
- Phase 05 can proceed without adapter ambiguity
- the provider protocol is not distorted by CLI-specific behavior
