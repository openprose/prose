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
kind: program
skills:
  - document-skills:pdf
---

### Ensures

- `extracted_invoice`: Json - normalized invoice fields
```

Or as a `### Skills` section:

```markdown
---
name: invoice-extractor
kind: program
---

### Skills

- `document-skills:pdf`

### Ensures

- `extracted_invoice`: Json - normalized invoice fields
```

`kind: program` is what `prose preflight` checks end-to-end. A standalone
`kind: system` declaration parses fine but preflight will report
`preflight_not_program` because the readiness checks (environment, runtime,
dependencies) only run against a program entrypoint. Use a `kind: program`
component (and reference systems/services from it) when you want preflight to
verify the whole package.

`prose preflight` walks every declared skill and resolves it against the
deterministic search path (`./skills/`, then `~/.claude/skills/`, then
`~/.codex/skills/`). If a declared skill is not installed, preflight emits a
`skill_unresolved` error and the run fails closed — there is no automatic
install. OpenProse never installs, edits, or deactivates the user's harness
skills; BYO harness is the invariant. The author is responsible for installing
the skill (e.g. via `/plugin marketplace install` or by cloning the skill into
`./skills/`).

## Activating declared skills at runtime

**This is the load-bearing contract.** When you execute an OpenProse program,
you ARE the VM. The `skills:` declaration is not advisory metadata — it is a
runtime requirement.

Before doing the work for any service whose component declares `skills:`, you
MUST invoke the harness's Skill tool with each declared canonical name. Do
this *before* you read inputs, before you reach for `Read`, `Bash`, or any
other tool that might appear to do the same job using built-in capabilities.

The reason is non-negotiable: a declared skill exists because the author
chose it for a reason — specific extraction logic, output format, anti-
hallucination guards, organizational conventions — that the harness's
built-in tools do not encode. Falling back to built-ins silently produces
wrong-but-plausible output and breaks reproducibility across model versions.

### Activation rules

| Where the skill is declared | What you activate, when |
|---|---|
| Program-level frontmatter (`skills:` on the `kind: program` component) | Activate before any service runs. Skill remains available for the entire program. |
| Inline-service block (`## sub-service` with its own `skills:`) | Activate before that sub-service's work begins. Additive to program-level skills, not exclusive — keep program-level skills active too. |
| `### Skills` section | Identical to the frontmatter form. |

If the program has been compiled to IR, prefer the canonical name pinned in
`component.skills[].canonical_name`. If you only have the source `.prose.md`,
use the declared name as written; the harness's plugin marketplace resolves
colon-form names directly (`document-skills:pdf` → `Skill` tool with that
name).

### Required behavior

- **Activate first, then work.** Do not infer that a built-in tool covers the
  declared skill. Activate, then proceed.
- **One skill per `Skill` tool invocation.** If three skills are declared,
  invoke the tool three times.
- **If activation fails** (the Skill tool errors or the canonical name is
  unknown to the harness), halt and report. Do not silently substitute a
  built-in tool. The author declared the skill because they needed it; falling
  back is the praying behavior the project explicitly rejects.
- **Do not deactivate skills the user already had loaded.** Activation is
  additive. BYO harness is sacred.
- **For each `## sub-service` you dispatch as a child run** (whether via
  Task, fresh CLI, or in-process delegate), include the resolved canonical
  names of the relevant skills in the briefing so the child also activates
  them at its boundary.

### Why you'll be tempted to skip this

Models with strong built-in capabilities — multimodal PDF rendering, web
fetch, code execution — will often produce a plausible answer without
activating the declared skill. The output looks right. It is still wrong:
you violated the contract, and reproducibility is now zero. The skill
declaration is the contract; honor it.

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
