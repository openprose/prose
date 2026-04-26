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
a company whose operating system is made of OpenProse programs and run-store
acceptance gates.

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

The package is designed for the Bun-backed `prose` CLI and for hosted runtimes
that execute the same package IR. Use deterministic `--output` fixtures for
smokes, then use a configured Pi runtime profile for real repository inspection.

Compile and publish-check the package:

```bash
bun run prose compile packages/co --no-pretty
bun run prose publish-check packages/co --strict --no-pretty
```

Run the checker with deterministic outputs:

```bash
bun run prose run packages/co/programs/company-repo-checker.prose.md \
  --approved-effect read_external \
  --input repo_path=customers/prose-openprose \
  --output repo-structure-inspector.source_layout='{"source_roots":["systems","shared"]}' \
  --output repo-structure-inspector.source_layout_failures='[]' \
  --output contract-eval-drift-inspector.contract_surface='{"evals":[]}' \
  --output contract-eval-drift-inspector.contract_surface_failures='[]' \
  --output dependency-graph-inspector.dependency_graph='{"edges":[]}' \
  --output dependency-graph-inspector.dependency_graph_failures='[]' \
  --output repo-readiness-reporter.report='{"passed":true,"failures":[]}' \
  --output repo-readiness-reporter.passed=true \
  --output repo-readiness-reporter.failures='[]'
```

The fixture shape mirrors the runtime contract: inspector nodes produce JSON
artifacts, the reporter returns the public JSON report, and the package eval can
gate the final run by reading the materialized run payload.

## Design Notes

- Keep this package generic. Do not include OpenProse, Inc. leads, accounts,
  GTM logic, release logic, or private operating assumptions.
- Prefer composable programs with inline starter components until a component
  earns a stable public API.
- Put universal primitives in `std/`; put company-operating-system patterns
  here.
- Keep generated runtime state out of this package. Useful lessons can become
  docs, fixtures, or evals.
