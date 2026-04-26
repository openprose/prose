# Superseded: Local Process Runtime Provider

Phase 04.3 originally added a small provider for command-style local
experiments. RFC 014 supersedes that decision: the local process adapter was
removed from the ideal package because it is not an agent harness and it taught
the wrong abstraction at the graph-runtime boundary.

The adapter was useful as scaffolding for:

- testing the provider protocol without credentials
- wrapping deterministic local tools
- proving artifact capture and timeout semantics
- giving the meta-harness a second provider shape before Pi

Those needs are now covered by internal scripted Pi sessions and focused store
tests. Command-style execution should return only if it becomes a clearly
scoped single-run harness adapter with sandboxing, effect mapping, and
traceable session semantics.

## Configuration

The provider accepts:

- `command`: argv array executed directly, without shell interpolation
- `timeoutMs`: command timeout, defaulting to 30 seconds
- `env`: provider-level environment values
- `outputFiles`: optional output-port to workspace-relative file path mapping
- `performedEffects`: explicit effects reported on success

If an expected output does not have an `outputFiles` entry, the provider reads
`<port>.md` from the workspace.

## Execution Semantics

- Missing required environment bindings block before spawning.
- Unapproved component effects block before spawning.
- Provider mismatches fail before spawning.
- Non-zero exits fail and keep stdout/stderr.
- Timeouts kill the process and fail with timeout diagnostics.
- Successful commands read declared output files into provider artifacts.

The command receives the merged environment from Bun, provider configuration,
and request environment bindings.

## Safety Limitations

The local process provider can execute arbitrary local commands. It should stay
local-only unless a future phase adds a sandboxed process executor. The provider
does not use a shell by default, but the command itself can still mutate files,
make network calls, or invoke other tools.

The meta-harness must continue to own:

- effect gates
- workspace preparation
- artifact store writes
- run attempts
- retries and resume
- user-facing trace records

## Backpressure

This slice is complete when the adapter and its tests are removed, the public
registry rejects command-style adapters as graph VMs, and a signpost records
why the package kept Pi/scripted Pi instead.
