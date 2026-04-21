# std/ops

Operational utilities for debugging, profiling, and validating Prose programs. These are the developer tools of the language -- the equivalent of `git status`, `cargo check`, and `go vet`. Each program maps to a `prose` CLI command.

## Programs

| Program | CLI Command | Description |
|---------|-------------|-------------|
| `lint.md` | `prose lint <file>` | Validate structure, schema, shapes, and contract compatibility |
| `preflight.md` | `prose preflight <file>` | Check that dependencies are installed and environment variables are set |
| `wire.md` | `prose run std/ops/wire` | Run Forme wiring to produce an execution manifest |
| `status.md` | `prose status` | Show recent runs with program name, duration, and pass/fail status |
| `diagnose.md` | `prose run std/ops/diagnose` | Diagnose why a run failed -- root cause analysis with fix recommendations |
| `profiler.md` | `prose run std/ops/profiler` | Profile a run for cost, tokens, and time using actual API session data |

## Two categories

**Source-file tools** operate on program `.md` files before execution:
- `lint` -- validates that the program is well-formed
- `preflight` -- validates that the runtime environment is ready
- `wire` -- produces the execution manifest (Forme wiring)

**Run-artifact tools** operate on completed runs in `.prose/runs/`:
- `status` -- lists recent runs and their outcomes
- `diagnose` -- investigates a failed run to find the root cause
- `profiler` -- breaks down cost, time, and token usage from actual session data
