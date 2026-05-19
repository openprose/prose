# std/ops

Operational utilities for debugging, profiling, and validating OpenProse systems. These are the developer tools of the language -- the equivalent of `git status`, `cargo check`, and `go vet`. Each system maps to a `prose` CLI command.

`prose-author.prose.md` is the authoring companion in this group: Prose for
making Prose. It plays the same role for OpenProse programs that skill-authoring
helpers play for agent skills: start from rough intent, produce reviewable
source, and keep validation in the generated artifact rather than in a wrapper.
In an agent host, `prose write` is interactive by default: it can ask targeted
shape/root questions before authoring. The shell CLI wrapper passes request
text up front and marks the run non-interactive, so missing blocking decisions
come back as `unresolved-intent` instead of terminal prompts.

## Systems

| System | CLI Command | Description |
|---------|-------------|-------------|
| `lint.prose.md` | `prose lint <file>` | Validate structure, schema, shapes, and contract matching |
| `preflight.prose.md` | `prose preflight <file>` | Check that dependencies are installed and environment variables are set |
| `wire.prose.md` | `prose run std/ops/wire` | Run Forme wiring to produce an execution manifest |
| `status.prose.md` | `prose status` | Show recent runs with system name, duration, and pass/fail status |
| `prose-author.prose.md` | `prose write [request...]` | Interactive-by-default authoring of a validated OpenProse package from rough English or pseudo-Prose |
| `diagnose.prose.md` | `prose run std/ops/diagnose` | Diagnose why a run failed -- root cause analysis with fix recommendations |
| `profiler.prose.md` | `prose run std/ops/profiler` | Profile a run for cost, tokens, and time using actual API session data |

## Two categories

**Source-file tools** operate on system `*.prose.md` files before execution:
- `lint` -- validates that the system is well-formed
- `preflight` -- validates that the runtime environment is ready
- `wire` -- produces the execution manifest (Forme wiring)

**Run-artifact tools** operate on completed runs in `<openprose-root>/runs/`:
- `status` -- lists recent runs and their outcomes
- `diagnose` -- investigates a failed run to find the root cause
- `profiler` -- breaks down cost, time, and token usage from actual session data
