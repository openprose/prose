# co — Company as Prose

Reusable starter contracts for organizing an operating company as an
OpenProse-native repository.

`co` sits next to `std` under `packages/`, not inside it. `std` is the
low-level standard library: roles, patterns, output adapters, memory, tests,
and ops primitives. `co` is an opinionated starter kit for a specific domain:
a company whose operating system is made of Prose services and systems.

Reference services and systems in `co` with the `co/` shorthand (analogous to
`std/`):

```markdown
use "co/systems/company-repo-checker"
```

Which expands to
`github.com/openprose/prose/packages/co/systems/company-repo-checker`.

## Package Shape

Authored Prose source files use `*.prose.md`. `README.md` remains plain
Markdown.

```text
packages/co/
  README.md
  systems/
    company-repo-checker/
      index.prose.md
  services/
    agent-readiness.prose.md
  evals/
    agent-readiness.eval.prose.md
    company-repo-checker.eval.prose.md
```

## Services and Systems

- **`agent-readiness`** — narrow intake a founder can run in under a minute:
  scores how accessible their site is to AI agents (well-known paths,
  plain-HTML parseability, structured metadata) and writes a screenshot-ready
  markdown report to the run's `bindings/agent-readiness.md`. Safe first-run
  demo: three prompts, one WebFetch batch, one report binding.
- **`company-repo-checker`** — static gate that verifies a company-as-prose
  repository still matches the shared layout before expensive runtime tests
  or fleet monitors do more work.

Future additions should help a new company get started without copying
OpenProse, Inc.'s private business logic:

- starter repository architecture
- company system map
- customer package checker
- test ladder
- fixture and run-replay conventions
- onboarding system for the first operating responsibilities

## std vs co — the split

- **std** — use-case-agnostic primitives. Inspector, contract-grader, retry,
  fan-out, worker-critic, human-gate. Things that make *Prose services and
  systems work*.
- **co** — company-operations-shaped patterns. Starter repo checkers,
  scheduled intake, windowed analytics, GTM pipelines, fleet monitors.
  Things that make *Prose services and systems produce business value*.

## Running Services and Systems

`prose run` is an agent-session command. It is not assumed to be a shell binary.
If a host provides a native Prose CLI, use it. Otherwise wrap the command in an
agent runner that has the OpenProse skill loaded.

Claude Code:

```bash
claude -p "prose run co/systems/company-repo-checker --repo_path <company-repo>"
```

Codex:

```bash
codex exec -C <workspace-root> "prose run co/systems/company-repo-checker --repo_path <company-repo>"
```

The shell executable is `claude` or `codex`. The `prose run ...` string is the
instruction the agent session interprets as the OpenProse VM.

## Design Notes

- Keep this package generic. Do not include OpenProse, Inc. leads, accounts,
  GTM logic, release logic, or private operating assumptions.
- Prefer composable services and systems with inline starter services until a
  service earns a stable public API.
- Put universal primitives in `std/`; put company-operating-system patterns
  here.
- Keep generated runtime state out of this package. Useful lessons can become
  docs, fixtures, or tests.
