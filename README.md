<p align="center">
  <img src="assets/readme-header.svg" alt="OpenProse - A new kind of language for a new kind of computer" width="100%" />
</p>

<p align="center">
  <em>A long-running AI session is a Turing-complete computer. OpenProse is a programming language for it.</em>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> •
  <a href="skills/open-prose/prose.md">Language Spec</a> •
  <a href="skills/open-prose/examples/">Examples</a>
</p>

---

```markdown
---
name: research-with-agents
kind: program
services: [researcher, writer]
---

requires:
- topic: a research question to investigate

ensures:
- report: an executive-ready summary of research findings

strategies:
- when initial research is shallow: deepen with more targeted queries
- when findings are too technical for executives: simplify language while preserving accuracy
```

## Overview

OpenProse is a programming language for AI sessions. Programs are Markdown files (`.md`) with YAML frontmatter and contract-based semantics — you declare what a program `requires:` and `ensures:`, and the runtime figures out the rest. Multi-service programs are auto-wired by the **Forme Container**, which matches contracts across components before the VM executes them.

This is the intelligent inversion of control: a container that understands context and intent, not just configuration.

OpenProse runs on any **Prose Complete** system — a model and harness combination capable of simulating the VM upon reading its specification. Currently supported: Claude Code + Opus, OpenCode + Opus, Amp + Opus. Your programs are portable across all of them; there is no library lock-in.

Legacy `.prose` programs still run via v0 mode (`prose run file.prose`). Use `prose migrate` to convert them to the new `.md` format.

## Install

```bash
npx skills add openprose/prose
```

> **By installing, you agree to the [Privacy Policy](PRIVACY.md) and [Terms of Service](TERMS.md).**

## Update

```bash
npx skills update openprose/prose
```

## How It Works

LLMs are simulators. When given a detailed system description, they don't just describe it — they simulate it. The OpenProse specifications describe a virtual machine and a dependency injection container with enough fidelity that a Prose Complete system reading them *becomes* those systems.

This isn't metaphor: each session triggers a real subagent, outputs are real artifacts, and state persists in the filesystem. Simulation with sufficient fidelity is implementation.

### Two-Phase Execution

For multi-service programs, execution happens in two phases:

| Phase | System | What It Does |
|-------|--------|--------------|
| **Phase 1** | Forme Container (`forme.md`) | Reads all services, matches `requires:`/`ensures:` contracts, produces a wiring manifest |
| **Phase 2** | Prose VM (`prose.md`) | Reads the manifest, walks the dependency graph, spawns sessions, passes data |

Single-service programs skip Phase 1 and execute directly in the VM.

| Aspect | Behavior |
|--------|----------|
| Contract matching | **Strict** — requires/ensures must resolve |
| Execution order | **Strict** — follows dependency graph exactly |
| Session creation | **Strict** — creates what program specifies |
| Context passing | **Intelligent** — summarizes and transforms as needed |
| Strategy application | **Intelligent** — applies declared strategies to edge cases |
| Completion detection | **Intelligent** — determines when "done" |

## Language Features

| Feature | Description |
|---------|-------------|
| Contracts | `requires:` inputs and `ensures:` outputs for each service |
| Shapes | Typed structure declarations for contract values |
| Strategies | Declarative edge-case handling (`when X: do Y`) |
| Errors | Structured error declarations |
| Invariants | Runtime constraints that must hold throughout execution |
| Services | Components wired by the Forme Container |
| Sessions | Subagent spawning (`call service` or `session "prompt"`) |
| Parallel | `parallel:` blocks with join strategies |
| Variables | `let x = call service` |
| Loops | `loop until condition (max: N):` and `repeat N:` |
| Conditionals | `if condition:` / `choice criteria:` |
| Error Handling | `try`/`catch`/`finally`, `retry` |
| Pipelines | `items \| map: session "..."` |
| Persistent Agents | `persist: true` / `resume: agent` |

See the [Language Reference](skills/open-prose/prose.md) for the VM spec and [Forme Reference](skills/open-prose/forme.md) for the container spec.

## Structure

- `skills/open-prose/` — the OpenProse skill: VM spec (`prose.md`), Forme container (`forme.md`), state backends, standard library, examples, and guidance
- `skills/open-prose/examples/` — example programs in `.md` format, from `01-hello-world.md` to `50-interactive-tutor.md`
- `skills/open-prose/lib/` — standard library with 9 utility programs (inspector, profiler, cost-analyzer, etc.)
- `skills/open-prose/guidance/` — authoring guidance: tenets, patterns, antipatterns
- `skills/open-prose/v0/` — legacy v0 VM specs for `.prose` files
- `skills/open-prose/state/` — state backend specs
- `assets/` — visual assets for documentation

### Examples

| Range | Category |
|-------|----------|
| 01–04 | Basics (hello world, research, code review, write and refine) |
| 09–13 | Agents, skills, variables, and composition |
| 16–25 | Parallel execution, error handling, loops, conditionals |
| 29–31 | Captain's chair pattern (persistent orchestrator) |
| 32–36 | Production workflows (PR review, auto-fix, content pipeline, feature factory, bug hunter) |
| 37 | The Forge (build a web browser from scratch with 5 agents) |
| 38–43 | Advanced patterns (skill scan, architect by simulation, RLM strategies) |
| 44–46 | Release and testing (endpoint UX test, plugin release, workflow crystallizer) |
| 47–50 | Self-improvement and learning (language self-improvement, habit miner, retrospective, interactive tutor) |

## Getting Started

1. Install the skill:
   ```bash
   npx skills add openprose/prose
   ```

2. Write an `.md` program or open one from `skills/open-prose/examples/`.

3. Run it inside a Prose Complete environment (Claude Code, OpenCode, or Amp with Opus):
   ```
   prose run my-program.md
   ```

Start with `01-hello-world.md` for the basics, or jump to `37-the-forge` to see what the language can do.

### Migrating from v0

If you have existing `.prose` programs:
```
prose migrate my-program.prose
```

This produces an equivalent `.md` file with YAML frontmatter, contract sections, and an execution block preserving your original logic. Legacy `.prose` files continue to work unchanged via `prose run file.prose`.

### State Backends

`.md` programs use the filesystem for state exclusively (the workspace/bindings model requires it).

For legacy `.prose` (v0) programs, alternative state backends are available:

- **SQLite** — run with `--state=sqlite` for queryable, transaction-safe state (requires `sqlite3` CLI)
- **PostgreSQL** — run with `--state=postgres` for concurrent parallel writes and external system integration (bring your own database; see security note below)

**PostgreSQL security note:** Database credentials in `OPENPROSE_POSTGRES_URL` are passed to subagent sessions and will be visible in agent context and logs. Use a dedicated database with minimal privileges and credentials you are comfortable being logged.

## FAQ

**Why not LangChain / CrewAI / AutoGen?**
Those are orchestration libraries — they coordinate agents from outside using code. OpenProse runs inside the agent session. Zero external dependencies, portable across any Prose Complete system.

**Why not just plain English?**
Complex workflows need unambiguous structure for control flow — the AI should not have to guess whether you want sequential or parallel execution. Contracts make intent explicit.

**What is "intelligent IoC"?**
Traditional IoC containers wire up dependencies from configuration. OpenProse's Forme Container is an AI system that wires up services using *understanding*. It doesn't just match names — it understands contracts, context, and intent.

**What changed in v2?**
Programs moved from imperative `.prose` syntax to declarative `.md` files with contracts. The Forme Container auto-wires multi-service programs. All v0 programs still work unchanged. Run `prose migrate` to convert.

## Beta & Legal

OpenProse is in **beta**:

- **Expect bugs** — Report issues at [github.com/openprose/prose/issues](https://github.com/openprose/prose/issues).
- **Use caution** — Review your programs before execution.
- **We want feedback** — Open issues, suggest features, report problems. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

You are responsible for all actions performed by AI agents you spawn through OpenProse.

- [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)

## See Also

- [prose.md](https://prose.md) — hosted execution environment for OpenProse programs
- [openprose/platform](https://github.com/openprose/platform) — the cloud platform (NestJS API, Next.js UIs, Fly.io execution)
