# co — Company as Prose

Reusable starter contracts for organizing an operating company as an
OpenProse-native repository.

If you are orienting from scratch, read these first:

- [`../../docs/README.md`](../../docs/README.md)
- [`../../docs/what-shipped.md`](../../docs/what-shipped.md)
- [`../../examples/README.md`](../../examples/README.md)

`co` sits next to `std` under `packages/`, not inside it. `std` is the
low-level standard library: roles, controls, delivery adapters, memory, evals,
and ops primitives. `co` is an opinionated starter kit for a specific domain:
a company whose operating system is made of Prose programs.

Reference programs in `co` with the `co/` shorthand (analogous to `std/`):

```markdown
use "co/programs/company-repo-checker"
```

Which expands to `github.com/openprose/prose/packages/co/programs/company-repo-checker`.

```bash
bun run prose install registry://openprose/@openprose/co@0.11.0-dev \
  --catalog-root packages \
  --workspace-root /tmp/openprose-workspace
```

## Package Shape

```text
packages/co/
  README.md
  prose.package.json
  programs/
    company-repo-checker.prose.md
  evals/
    company-repo-checker.eval.prose.md
```

Future additions should help a new company get started without copying
OpenProse, Inc.'s private business logic:

- starter repository architecture
- company system map
- native repo checker
- customer package checker
- eval ladder
- fixture and run-replay conventions
- onboarding workflow for the first operating responsibilities

## std vs co — the split

- **std** — use-case-agnostic primitives. Inspector, contract-grader, retry,
  fan-out, worker-critic, human-gate. Things that make *prose programs work*.
- **co** — company-operations-shaped patterns. Starter repo checkers,
  scheduled intake, windowed analytics, GTM pipelines, fleet monitors.
  Things that make *prose programs produce business value*.

## Running Programs

`prose run` is an agent-session command. It is not assumed to be a shell binary.
If a host provides a native Prose CLI, use it. Otherwise wrap the command in an
agent runner that has the OpenProse skill loaded.

Claude Code:

```bash
claude -p "prose run co/programs/company-repo-checker --repo_path customers/prose-openprose"
```

Codex:

```bash
codex exec -C <workspace-root> "prose run co/programs/company-repo-checker --repo_path customers/prose-openprose"
```

The shell executable is `claude` or `codex`. The `prose run ...` string is the
instruction the agent session interprets as the OpenProse VM.

## Design Notes

- Keep this package generic. Do not include OpenProse, Inc. leads, accounts,
  GTM logic, release logic, or private operating assumptions.
- Prefer composable programs with inline starter components until a component
  earns a stable public API.
- Put universal primitives in `std/`; put company-operating-system patterns
  here.
- Keep generated runtime state out of this package. Useful lessons can become
  docs, fixtures, or evals.
