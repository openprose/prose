---
name: open-prose
description: |
  Activate when the user asks to write, run, inspect, lint, package, publish,
  or explain OpenProse programs. OpenProse source is `.prose.md`: typed
  contracts compile to IR, then the local CLI coordinates the Pi graph VM to
  materialize durable run records. Use this skill to route the work and preserve
  the graph-VM model; do not hand-author runtime state in chat.
---

# OpenProse Skill

OpenProse is a React-like framework for agent outcomes.

Authors write canonical `.prose.md` contracts with typed inputs, typed outputs,
effects, access rules, evals, and optional execution hints. The package compiles
those contracts into IR, plans the reactive graph, coordinates Pi as the graph
VM, materializes immutable run records, and projects registry/package metadata
from the same source of truth.

## Runtime Model

- Source format: `.prose.md`
- Compiler target: OpenProse IR
- Local reactive graph VM: `pi`
- Model providers: configured inside the Pi runtime profile, not selected as
  graph VMs
- Durable output: run records, node records, artifact records, traces, eval
  records, and package metadata
- Hosted boundary: `prose remote execute` emits the host-ingestion envelope
  using the same run/artifact contract

## Declaring required skills

A `.prose.md` program can name the agent skills it requires so OpenProse can
fail closed when they are missing instead of hoping a sub-agent auto-activates
the right one. Names use the colon form `<namespace>:<name>`, matching the
`/skill` plugin marketplace convention (e.g. `document-skills:pdf`).

Two equivalent ways to declare:

In frontmatter:

```yaml
---
name: invoice-extractor
kind: system
skills:
  - document-skills:pdf
---
```

Or as a `### Skills` section:

```markdown
### Skills

- `document-skills:pdf`
```

`prose preflight` walks every declared skill and resolves it against the
deterministic search path (`./skills/`, then `~/.claude/skills/`, then
`~/.codex/skills/`). If a declared skill is not installed, preflight emits a
`skill_unresolved` error and the run fails closed — there is no automatic
install. OpenProse never installs, edits, or deactivates the user's harness
skills; BYO harness is the invariant. The author is responsible for installing
the skill (e.g. via `/plugin marketplace install` or by cloning the skill into
`./skills/`).

## Routing

When the user asks for OpenProse work:

| Intent | Route |
| --- | --- |
| Explain the project | Read `README.md`, `docs/README.md`, and focused docs/examples |
| Author a program | Write or edit `.prose.md`; run `prose lint` and `prose preflight` |
| Compile or inspect source | Use `bun run prose compile`, `manifest`, `graph`, `plan`, or `highlight` |
| Run locally | Use `bun run prose run <file.prose.md> --graph-vm pi` |
| Deterministic fixture run | Use `--output port=value` on `prose run` or `prose remote execute` |
| Live inference run | Use `--graph-vm pi` with `--model-provider`, `--model`, and `--thinking`; env vars are CI-friendly defaults |
| Hosted contract fixture | Use `bun run prose remote execute ...` |
| Package or registry work | Use `prose package`, `publish-check`, `search`, and `install` |
| Debug a run | Use `prose status` and `prose trace` against the run root |

Prefer the repository CLI when it is available. The CLI is the compiler,
planner, graph executor, run-store writer, package metadata projector, and
hosted-envelope generator.

## One-Off Harness Boundary

Single component contracts can still be handed to a compatible agent harness as
one-off tasks. That is not the same thing as reactive graph execution.

- For a single component, the harness can read the contract and produce the
  declared outputs.
- For a reactive graph, OpenProse coordinates Pi sessions node by node and
  materializes the graph run.
- Do not claim that Codex CLI, Claude Code, OpenCode, or another shell process
  is the graph VM unless there is an actual adapter and test evidence.

## Execution Boundary

Use `.prose.md` source through the CLI and Pi graph VM for reactive graph
execution. Single-component work can be exported with `prose handoff`, but
hand-authored state logs are not OpenProse runs.

## Useful Commands

```bash
bun run prose help
bun run prose lint examples/north-star/company-signal-brief.prose.md
bun run prose preflight examples/north-star/lead-program-designer.prose.md
bun run prose graph examples/north-star/lead-program-designer.prose.md
bun run prose run examples/north-star/company-signal-brief.prose.md \
  --graph-vm pi \
  --input signal_notes="A customer asked for durable agent workflows." \
  --input brand_context="OpenProse helps teams compose typed agent outcomes." \
  --output company_signal_brief="Signals noted."
bun run prose status .prose/runs
bun run prose trace .prose/runs/<run-id>
bun run prose package examples --format json
bun run prose publish-check examples --strict
```

## When Not To Use OpenProse

Do not force OpenProse onto one-shot questions, tiny tasks the user wants done
inline, or exploratory conversations where a typed run record would add more
friction than clarity. OpenProse shines when the workflow needs reuse,
composition, provenance, evals, effect gates, or reactive recomputation.
