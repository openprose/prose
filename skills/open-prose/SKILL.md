---
name: open-prose
description: |
  OpenProse is a programming language for AI sessions. Activate on any `prose`
  command, `.md` Contract Markdown program, `.prose` ProseScript program,
  mention of OpenProse/Forme/ProseScript, or multi-agent workflow request.
---

# OpenProse Skill

OpenProse has four load-bearing pieces:

| Piece | File | Role |
|-------|------|------|
| **Contract Markdown** | `contract-markdown.md` | Human-readable `.md` program and service format |
| **Forme** | `forme.md` | Semantic dependency-injection container that wires contracts |
| **Prose VM** | `prose.md` | Execution engine that runs manifests and services |
| **ProseScript** | `prosescript.md` | Imperative scripting layer for `.prose` files and `### Execution` blocks |

Use Contract Markdown when authors want declarations and auto-wiring. Use
ProseScript when authors want to pin choreography: order, loops, conditionals,
parallelism, retries, and explicit service calls.

## Activation

Activate this skill when the user:

- uses any `prose` command
- asks to run, lint, test, inspect, migrate, or write an OpenProse program
- references a `.md` program with `kind:` frontmatter
- references a `.prose` program
- mentions OpenProse, Forme, ProseScript, Contract Markdown, or a Prose program
- wants reusable multi-agent orchestration

## Command Routing

| Command | Action |
|---------|--------|
| `prose run <file.md>` | Detect Contract Markdown, load `contract-markdown.md`, then `forme.md` if multi-service, then `prose.md` |
| `prose run <file.prose>` | Load `prosescript.md` and execute directly through the Prose VM |
| `prose run handle/slug` | Resolve remote program, detect format, then route as above |
| `prose lint <file.md>` | Validate Contract Markdown structure, headers, frontmatter, contracts, shapes, and wiring |
| `prose preflight <file.md>` | Check dependencies and `### Environment` declarations without executing |
| `prose test <path>` | Load `contract-markdown.md` and `prose.md`; run `kind: test` program(s) |
| `prose inspect <run-id>` | Resolve and run `std/evals/inspector` against a completed run |
| `prose status` | Summarize recent `.prose/runs/` entries |
| `prose status --graph` | Reconstruct the run DAG from `state.md` `upstream:` headers |
| `prose install` | Load `deps.md`; install dependency references into `.deps/` and write `prose.lock` |
| `prose install --update` | Load `deps.md`; update pinned dependency SHAs |
| `prose help` | Load `help.md` |
| `prose examples` | List or run bundled examples from `examples/` |
| `prose migrate <file.prose>` | Convert ProseScript to Contract Markdown using `prosescript.md` and `contract-markdown.md` |
| Other | Interpret intent and load the smallest relevant spec set |

There is one skill: `open-prose`. Do not look for separate `prose-run`,
`prose-lint`, `prose-compile`, or `prose-boot` skills.

## Format Detection

| Format | Extension | Primary Docs | Execution Path |
|--------|-----------|--------------|----------------|
| Contract Markdown | `.md` | `contract-markdown.md`, `forme.md`, `prose.md` | Forme wires multi-service programs; Prose VM executes |
| ProseScript | `.prose` | `prosescript.md`, `prose.md` | Prose VM executes script statements directly |

For `.md` files:

1. Read YAML frontmatter.
2. If `kind: program` has a non-empty `services:` list, load `forme.md` to produce a manifest.
3. Load `prose.md` and `state/filesystem.md` to execute the manifest.
4. If the file is a single component (`kind: service` or `kind: program` without `services:`), skip Forme and execute the component directly.

For `.prose` files:

1. Load `prosescript.md`.
2. Load `prose.md` for VM execution behavior.
3. Execute statements strictly, using model judgment for natural-language conditions.

## Contract Markdown Sections

Contract Markdown uses Markdown headers as the canonical human-facing syntax:

````markdown
### Requires

- `topic`: the question to investigate

### Ensures

- `report`: concise answer with sources

### Strategies

- when sources are thin: broaden search terms

### Execution

```prose
let report = call researcher
  topic: topic

return report
```
````

Header hierarchy:

- `#` is optional human title.
- `##` starts an inline component in multi-service files.
- Inline components may have a YAML block immediately after the `##` heading.
- `###` starts a section inside the current component.
- Lowercase compatibility blocks (`requires:`, `ensures:`, etc.) remain accepted, but the header form is canonical.

## File Locations

All OpenProse skill files are colocated with this `SKILL.md`. Do not search the
user workspace for these docs.

| File | Purpose |
|------|---------|
| `contract-markdown.md` | Contract Markdown format and section hierarchy |
| `prosescript.md` | Imperative scripting syntax for `.prose` and `### Execution` |
| `forme.md` | Forme container wiring semantics |
| `prose.md` | Prose VM execution semantics |
| `deps.md` | Dependency resolution and `prose install` |
| `help.md` | User-facing help |
| `state/filesystem.md` | Default state backend for Contract Markdown runs |
| `primitives/session.md` | Subagent session and memory guidelines |
| `guidance/tenets.md` | Architectural tenets |
| `guidance/patterns.md` | Authoring patterns |
| `guidance/antipatterns.md` | Authoring antipatterns |
| `examples/` | Example programs |
| `v0/` | Historical ProseScript-era references retained for compatibility |

Workspace files:

| Path | Purpose |
|------|---------|
| `.prose/.env` | Runtime configuration |
| `.prose/runs/` | Run state and artifacts |
| `.prose/agents/` | Project-scoped persistent agents |
| `.deps/` | Installed dependencies, gitignored |
| `prose.lock` | Dependency lockfile, committed |
| `*.md` | Contract Markdown programs and services |
| `*.prose` | ProseScript programs |

User-level persistent agents live under `~/.prose/agents/`.

## Remote Programs

`prose run` accepts URLs and registry shorthands:

| Input | Resolution |
|-------|------------|
| Starts with `http://` or `https://` | Fetch directly |
| Starts with `@` | Strip `@`, resolve to `https://p.prose.md/{path}` |
| Contains `/` but no protocol | Resolve to `https://p.prose.md/{path}` |
| Otherwise | Treat as local path |

`use` statements inside programs use the git-native dependency model from
`deps.md`: dependencies are installed into `.deps/` by `prose install` and read
from disk at runtime.

## State Modes

Contract Markdown runs use filesystem state by default and should be documented
against `.prose/runs/{id}/`.

Alternative state docs (`state/in-context.md`, `state/sqlite.md`,
`state/postgres.md`) are retained for ProseScript compatibility and
experimental workflows. Load them only when the user explicitly requests that
mode.

## Authoring Guidance

When writing a new program, load:

- `contract-markdown.md`
- `guidance/tenets.md`
- `guidance/patterns.md`
- `guidance/antipatterns.md`

When writing a `### Execution` block or `.prose` file, also load
`prosescript.md`.
