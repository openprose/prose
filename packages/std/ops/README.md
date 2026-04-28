# std/ops

Operational utilities for debugging, profiling, and validating Prose programs. These are the developer tools of the language -- the equivalent of `git status`, `cargo check`, and `go vet`. Each program maps to a `prose` CLI command.

## Programs

| Program | CLI Command | Description |
|---------|-------------|-------------|
| `lint.prose.md` | `prose lint <file>` | Validate structure, schema, shapes, and contract compatibility |
| `preflight.prose.md` | `prose preflight <file>` | Check that pinned dependencies are installed and required environment variables are set |
| `wire.prose.md` | `prose manifest <file>` | Produce the readable manifest projection from canonical IR |
| `status.prose.md` | `prose status [.prose/runs]` | Show recent local run materializations with status, outputs, and run paths |
| `diagnose.prose.md` | `prose run std/ops/diagnose` | Diagnose why a run failed -- root cause analysis with fix recommendations |
| `profiler.prose.md` | `prose run std/ops/profiler` | Profile a run for cost, tokens, and time using actual API session data |

## Two categories

**Source-file tools** operate on program `.prose.md` files before execution:
- `lint` -- validates that the program is well-formed
- `preflight` -- validates local dependency and environment readiness
- `manifest` -- produces the manifest projection from canonical IR

**Run-artifact tools** operate on completed runs in `.prose/runs/`:
- `status` -- lists recent runs and their outcomes
- `diagnose` -- investigates `run.json`, `trace.json`, node records, artifacts, and store attempts to find the root cause
- `profiler` -- breaks down time, retries, model usage, tokens, cost, and artifact volume when structured telemetry is available
