# Local Process Runtime Provider

Phase 04.3 adds a small provider for command-style local experiments. It is
explicitly non-agentic: it runs one command array in a workspace, captures
process facts, and reads declared output files.

This provider is useful for:

- testing the provider protocol without credentials
- wrapping deterministic local tools
- proving artifact capture and timeout semantics
- giving the meta-harness a second provider shape before Pi

It is not a substitute for an agent harness.

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

This slice is complete when:

- command success captures stdout, stderr, exit code, duration, and files
- command failure captures stderr and non-zero exit diagnostics
- timeouts produce deterministic failed results
- provider artifacts write through the shared provider artifact helper

