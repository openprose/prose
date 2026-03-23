<p align="center">
  <img src="assets/readme-header.svg" alt="OpenProse - A new kind of language for a new kind of computer" width="100%" />
</p>

<p align="center">
  <em>A long-running AI session is a Turing-complete computer. OpenProse is a programming language for it.</em>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> •
  <a href="skills/open-prose/compiler.md">Language Spec</a> •
  <a href="skills/open-prose/examples/">Examples</a>
</p>

---

```prose
# Research and write workflow
agent researcher:
  model: sonnet
  skills: ["web-search"]

agent writer:
  model: opus

parallel:
  research = session: researcher
    prompt: "Research quantum computing breakthroughs"
  competitive = session: researcher
    prompt: "Analyze competitor landscape"

loop until **the draft meets publication standards** (max: 3):
  session: writer
    prompt: "Write and refine the article"
    context: { research, competitive }
```

## Overview

OpenProse is a programming language for AI sessions. Instead of orchestrating agents from the outside with code, you declare agents and control flow in `.prose` files and an AI session wires them up — the session itself is the runtime. This is the intelligent inversion of control: a container that understands context and intent, not just configuration.

OpenProse runs on any **Prose Complete** system — a model and harness combination capable of simulating the VM upon reading its specification. Currently supported: Claude Code + Opus, OpenCode + Opus, Amp + Opus. Your `.prose` files are portable across all of them; there is no library lock-in.

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

LLMs are simulators. When given a detailed system description, they don't just describe it — they simulate it. The OpenProse specification (`prose.md`) describes a virtual machine with enough fidelity that a Prose Complete system reading it *becomes* that VM.

This isn't metaphor: each `session` triggers a real subagent, outputs are real artifacts, and state persists in conversation history or files. Simulation with sufficient fidelity is implementation.

| Aspect | Behavior |
|--------|----------|
| Execution order | **Strict** — follows program exactly |
| Session creation | **Strict** — creates what program specifies |
| Parallel coordination | **Strict** — executes as specified |
| Context passing | **Intelligent** — summarizes and transforms as needed |
| Condition evaluation | **Intelligent** — interprets `**...**` semantically |
| Completion detection | **Intelligent** — determines when "done" |

## Language Features

| Feature | Example |
|---------|---------|
| Agents | `agent researcher: model: sonnet` |
| Sessions | `session "prompt"` or `session: agent` |
| Persistent Agents | `agent captain: persist: true` / `resume: captain` |
| Parallel | `parallel:` blocks with join strategies |
| Variables | `let x = session "..."` |
| Context | `context: [a, b]` or `context: { a, b }` |
| Fixed Loops | `repeat 3:` and `for item in items:` |
| Unbounded Loops | `loop until **condition**:` |
| Error Handling | `try`/`catch`/`finally`, `retry` |
| Pipelines | `items \| map: session "..."` |
| Conditionals | `if **condition**:` / `choice **criteria**:` |

The `**...**` syntax is the fourth wall — it lets you speak directly to the OpenProse VM for conditions, criteria, and decisions that require AI judgment rather than strict evaluation.

See the [Language Reference](skills/open-prose/compiler.md) for complete documentation.

## Structure

- `skills/open-prose/` — the OpenProse VM skill: language spec (`prose.md`), compiler, state backends, standard library, examples, and guidance. This is the canonical definition of the VM; the hosted service at [prose.md](https://prose.md) implements it as a cloud execution environment.
- `skills/open-prose/examples/` — 50 numbered `.prose` programs covering the full feature set, from `01-hello-world.prose` to `50-interactive-tutor.prose`
- `skills/open-prose/state/` — state backend specs: filesystem (default), in-context, SQLite, PostgreSQL
- `assets/` — visual assets for documentation

### Examples by Range

| Range | Category |
|-------|----------|
| 01–08 | Basics (hello world, research, code review, debugging) |
| 09–12 | Agents and skills |
| 13–15 | Variables and composition |
| 16–19 | Parallel execution |
| 20–21 | Loops and pipelines |
| 22–23 | Error handling |
| 24–27 | Advanced (choice, conditionals, blocks, interpolation) |
| 28 | Gas Town (multi-agent orchestration) |
| 29–31 | Captain's chair pattern (persistent orchestrator) |
| 32 | Automated PR review |
| 33–36 | Production workflows (PR auto-fix, content pipeline, feature factory, bug hunter) |
| 37 | The Forge (build a browser from scratch) |
| 38–43 | Advanced patterns (skill scan, architect by simulation, RLM strategies) |
| 44–46 | Release and testing (endpoint UX test, plugin release, workflow crystallizer) |
| 47–50 | Self-improvement and learning (language self-improvement, habit miner, retrospective, interactive tutor) |

## Getting Started

1. Install the skill:
   ```bash
   npx skills add openprose/prose
   ```

2. Write a `.prose` file or open one from `skills/open-prose/examples/`.

3. Run it inside a Prose Complete environment (Claude Code, OpenCode, or Amp with Opus):
   ```
   prose run my-program.prose
   ```

Start with `01-hello-world.prose` for the basics, or jump to `37-the-forge.prose` to see what the language can do.

### State Backends

By default, OpenProse uses the filesystem for state. For advanced use cases:

- **SQLite** — run with `--state=sqlite` for queryable, transaction-safe state (requires `sqlite3` CLI)
- **PostgreSQL** — run with `--state=postgres` for concurrent parallel writes and external system integration (bring your own database; see security note below)

**PostgreSQL security note:** Database credentials in `OPENPROSE_POSTGRES_URL` are passed to subagent sessions and will be visible in agent context and logs. Use a dedicated database with minimal privileges and credentials you are comfortable being logged.

## FAQ

**Why not LangChain / CrewAI / AutoGen?**
Those are orchestration libraries — they coordinate agents from outside using code. OpenProse runs inside the agent session. Zero external dependencies, portable across any Prose Complete system.

**Why not just plain English?**
You can use `**...**` for that. But complex workflows need unambiguous structure for control flow — the AI should not have to guess whether you want sequential or parallel execution.

**What is "intelligent IoC"?**
Traditional IoC containers wire up dependencies from configuration. OpenProse's container is an AI session that wires up agents using *understanding*. It doesn't just match names — it understands context, intent, and can make intelligent decisions about execution.

## Beta & Legal

OpenProse is in **beta**:

- **Expect bugs** — Report issues at [github.com/openprose/prose/issues](https://github.com/openprose/prose/issues).
- **Use caution** — Review your `.prose` programs before execution.
- **We want feedback** — Open issues, suggest features, report problems. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

You are responsible for all actions performed by AI agents you spawn through OpenProse.

- [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)

## See Also

- [prose.md](https://prose.md) — hosted execution environment for OpenProse programs
- [openprose/platform](https://github.com/openprose/platform) — the cloud platform (NestJS API, Next.js UIs, Fly.io execution)
