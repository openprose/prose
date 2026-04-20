<p align="center">
  <img src="assets/readme-header.svg" alt="OpenProse - Engineer your agents" width="100%" />
</p>

<p align="center">
  <strong>Contracts, composition, and version control for the Markdown your agents run on.</strong>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> |
  <a href="skills/open-prose/README.md">Docs</a> |
  <a href="skills/open-prose/examples/">Examples</a> |
  <a href="skills/open-prose/contract-markdown.md">Spec</a> |
  <a href="https://github.com/openprose/std">Stdlib</a>
</p>

<p align="center">
  <code>npx skills add openprose/prose</code>
</p>

---

OpenProse is a programming language for AI sessions.

Write a Markdown file with a contract. Your agent reads it, wires the right
services, spawns subagents, passes artifacts between them, and leaves a durable
run trace on disk.

The program declares **what** should happen. The runtime figures out **how**.

```markdown
---
name: hunter
kind: program
---

### Services

- `analyst`
- `ranker`
- `compiler`

### Requires

- `data_warehouse_url`: where growth data lives
- `codebase_ref`: repository or branch to inspect

### Ensures

- `brief`: weekly growth findings ranked by confidence x impact

### Strategies

- prefer findings with code-level evidence
- surface instrumentation gaps as first-class findings
```

## Quickstart

Install the skill in a Prose Complete agent environment:

```bash
npx skills add openprose/prose
```

Create `hello.md`:

```markdown
---
name: hello
kind: service
---

### Ensures

- `message`: a warm one-paragraph introduction to OpenProse
```

Run it:

```bash
prose run hello.md
```

OpenProse writes the run state to `.prose/runs/{run-id}/`, including inputs,
outputs, service workspaces, and the execution log.

> By installing, you agree to the [Privacy Policy](PRIVACY.md) and
> [Terms of Service](TERMS.md).

## Why It Exists

Plain prompts are easy to start and hard to maintain. As soon as an agent
workflow has multiple roles, retries, memory, security boundaries, or handoffs,
you need something more durable than "please do the right thing."

OpenProse gives agents a small set of primitives that fit naturally in a repo:

| Primitive | What it gives you |
|-----------|-------------------|
| `### Requires` | Inputs the caller, host, or upstream services must provide |
| `### Ensures` | Outputs the component promises to produce |
| `### Services` | Named components Forme can auto-wire by semantic contract |
| `### Runtime` | Execution hints such as persistence or model choice |
| `### Shape` | Capability boundaries: what a service may do, delegate, or avoid |
| `### Strategies` | Judgment rules for edge cases and degraded conditions |
| `### Execution` | Optional ProseScript when you want exact order, loops, branches, or retries |
| `.prose/runs/` | Auditable filesystem state for every run |

The result is agent software that can be read, reviewed, versioned, forked, and
improved like code.

## How It Works

OpenProse has two authoring surfaces:

**Contract Markdown** is the default. You write components with `### Requires`,
`### Ensures`, and optional sections like `### Strategies`, `### Environment`,
`### Errors`, and `### Invariants`. Multi-service programs are wired by the
Forme container.

**ProseScript** is the pinning layer. Use it in `.prose` files or
`### Execution` blocks when order matters:

````markdown
### Execution

```prose
let findings = call researcher
  topic: topic

let report = call writer
  findings: findings

return report
```
````

For multi-service programs, execution has two phases:

| Phase | System | Job |
|-------|--------|-----|
| 1 | [Forme](skills/open-prose/forme.md) | Read contracts, resolve services, build the wiring manifest |
| 2 | [Prose VM](skills/open-prose/prose.md) | Walk the manifest, spawn sessions, pass artifacts, enforce constraints |

Single-service programs skip Forme and run directly in the VM.

## What You Can Build

- Research pipelines with specialist agents and source-grounded reports
- Code review teams with security, performance, and style reviewers
- Feature factories that plan, implement, test, document, and summarize
- Persistent captains that retain project memory across runs
- Evaluation loops, worker-critic systems, and recursive reasoning workflows
- Reusable services published through git-native dependencies

Start with:

| Path | Why open it |
|------|-------------|
| [01-hello-world.md](skills/open-prose/examples/01-hello-world.md) | Smallest possible program |
| [09-research-with-agents](skills/open-prose/examples/09-research-with-agents/) | First multi-agent workflow |
| [35-feature-factory](skills/open-prose/examples/35-feature-factory/) | Production-style build loop |
| [39-architect-by-simulation](skills/open-prose/examples/39-architect-by-simulation/) | Pinned ProseScript choreography |
| [47-language-self-improvement](skills/open-prose/examples/47-language-self-improvement/) | OpenProse improving OpenProse |

## Standard Library

The standard library lives in
[`openprose/std`](https://github.com/openprose/std), not this repository.

Reference std programs with `std/...` or `openprose/std/...`, then install and
pin them:

```markdown
use "std/evals/inspector"
```

```bash
prose install
```

Dependencies are cloned into `.deps/`, locked in `prose.lock`, and read from
disk at runtime. No network fetch happens during execution.

## Project Map

| Path | Purpose |
|------|---------|
| [skills/open-prose/SKILL.md](skills/open-prose/SKILL.md) | Skill activation and command routing |
| [skills/open-prose/contract-markdown.md](skills/open-prose/contract-markdown.md) | Canonical Markdown program format |
| [skills/open-prose/prosescript.md](skills/open-prose/prosescript.md) | Imperative scripting syntax |
| [skills/open-prose/forme.md](skills/open-prose/forme.md) | Semantic dependency-injection container |
| [skills/open-prose/prose.md](skills/open-prose/prose.md) | VM execution semantics |
| [skills/open-prose/deps.md](skills/open-prose/deps.md) | Git-native dependency resolution |
| [skills/open-prose/examples/](skills/open-prose/examples/) | Example programs |
| [skills/open-prose/guidance/](skills/open-prose/guidance/) | Tenets, patterns, and antipatterns |
| [skills/open-prose/state/](skills/open-prose/state/) | State backend specs |

Historical ProseScript-era references live in
[skills/open-prose/v0/](skills/open-prose/v0/). Existing `.prose` programs still
run, and `prose migrate my-program.prose` can wrap them in Contract Markdown.

## FAQ

**Where does OpenProse run?**

Any Prose Complete system: an agent plus harness that can read files, write
files, run tools, and spawn subagents. The current docs target Codex-style and
Claude Code-style environments.

**Why not LangChain, CrewAI, or AutoGen?**

Those are orchestration libraries. OpenProse is an agent-native program format:
the workflow lives in Markdown, runs inside the agent session, and stays
portable across harnesses.

**Why not just plain English?**

Plain English is great for one-offs. Durable workflows need contracts, named
components, state, tests, and a way to say "this must happen before that."

**How do Contract Markdown and ProseScript fit together?**

Contract Markdown declares promises and lets Forme wire the graph. ProseScript
pins choreography when a workflow needs exact calls, loops, conditionals,
parallelism, or retries. Both are first-class.

## Beta

OpenProse is early. Expect sharp edges, review programs before execution, and
open issues when something feels clumsy or underpowered:

- [Issues](https://github.com/openprose/prose/issues)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)
