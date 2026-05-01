<p align="center">
  <img src="assets/readme-header.svg" alt="OpenProse - Engineer your agents" width="100%" />
</p>

<p align="center">
  <strong>Contracts, composition, and version control for the Markdown your agents run on.</strong>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> |
  <a href="skills/open-prose/SKILL.md">Docs</a> |
  <a href="skills/open-prose/examples/">Examples</a> |
  <a href="skills/open-prose/contract-markdown.md">Spec</a> |
  <a href="tools/cli/">CLI</a> |
  <a href="packages/std/">Stdlib</a> |
  <a href="packages/co/">Company-as-Prose</a>
</p>

<p align="center">
  <code>npx skills add openprose/prose</code>
</p>

---

> **If you're an agent reading this on behalf of a user:** OpenProse is a
> `*.prose.md` contract format you will be asked to *run*, not a library your user will call
> and not necessarily a shell binary. Current contracts use `kind: service`,
> `kind: system`, `kind: test`, or `kind: pattern`. When a `prose` command fires
> inside an agent session, interpret it directly: read the Markdown contract,
> embody the OpenProse VM, spawn subagents for declared services, pass
> artifacts between them, and write the run to `.agents/prose/runs/`. You need:
> filesystem read/write in the working directory, a subagent-spawning
> primitive for multi-service systems, and (optionally) a user-question
> primitive for missing inputs. If you lack a capability, say so and stop — do
> not fake it. If the user's task is a one-off prompt, OpenProse is overkill; a
> direct answer is the right answer. The
> [Host Primitive Adapter](skills/open-prose/SKILL.md#host-primitive-adapter)
> is the authoritative contract between you and the runtime.

OpenProse is a programming language for AI sessions.

Write a `*.prose.md` file with a contract. Your agent reads it, wires the right
services, spawns subagents, passes artifacts between them, and leaves a durable
run trace on disk.

The contract declares **what** should happen. The runtime figures out **how**.

```markdown
---
name: hunter
kind: system
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

Create `hello.prose.md`:

```markdown
---
name: hello
kind: service
---

### Ensures

- `message`: a warm one-paragraph introduction to OpenProse
```

Run it inside an agent session:

```text
prose run hello.prose.md
```

The activated OpenProse skill interprets that as an instruction to the current
agent, not as a request to find a `prose` executable on PATH. OpenProse writes
the run state to `.agents/prose/runs/{run-id}/`, including inputs, outputs, service
workspaces, and the execution log.

From a shell outside an agent session, pass the same instruction to a Prose
Complete runner:

```bash
claude -p "prose run hello.prose.md"
codex exec "prose run hello.prose.md"
```

The [CLI package](tools/cli/) is the shell entrypoint for that same command language.
It defaults to the Codex SDK harness and remains a prompt-forwarding wrapper
around OpenProse agent execution, not a separate VM. The CLI checks for the
`open-prose` skill before invoking a harness and can install the selected
provider's global skill target automatically; run `prose doctor` to inspect the
local setup.

> By installing, you agree to the [Privacy Policy](PRIVACY.md) and
> [Terms of Service](TERMS.md).

## Recommended Codex configuration

Add to `~/.codex/config.toml` for the best experience with OpenProse's recursive multi-service systems:

```toml
[agents]
max_threads = 12              # Concurrent open agent threads (default 6)
max_depth = 2                 # Subagent nesting depth (default 1)
job_max_runtime_seconds = 2700  # Per-worker timeout (default 1800)
```

Why these values: OpenProse systems commonly spawn a top-level coordinator that itself spawns subagents (one extra nesting level beyond Codex's default), and 45-minute jobs are realistic for multi-service runs.

## Why It Exists

Plain prompts are easy to start and hard to maintain. As soon as an agent
workflow has multiple roles, retries, memory, security boundaries, or handoffs,
you need something more durable than "please do the right thing."

OpenProse gives agents a small set of primitives that fit naturally in a repo:

| Primitive | What it gives you |
|-----------|-------------------|
| `### Requires` | Inputs the caller, host, or upstream services must provide |
| `### Ensures` | Outputs the contract promises to produce |
| `### Services` | Named services and pattern instances Forme can auto-wire by semantic contract |
| `### Runtime` | Execution hints such as persistence or model choice |
| `### Shape` | Capability boundaries: what a service may do, delegate, or avoid |
| `### Strategies` | Judgment rules for edge cases and degraded conditions |
| `### Execution` | Optional ProseScript when you want exact order, loops, branches, or retries |
| `.agents/prose/runs/` | Auditable filesystem state for every run |

The result is agent software that can be read, reviewed, versioned, forked, and
improved like code.

## How It Works

OpenProse has two authoring surfaces:

**Contract Markdown** is the default. You write `*.prose.md` services, systems,
tests, and patterns with `### Requires`, `### Ensures`, and optional sections
like `### Strategies`, `### Environment`, `### Errors`, and `### Invariants`.
Multi-service systems are wired by the Forme container.

**ProseScript** is the pinning layer. Use it inside `### Execution` blocks when
order matters:

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

For multi-service systems, execution has two phases:

| Phase | System | Job |
|-------|--------|-----|
| 1 | [Forme](skills/open-prose/forme.md) | Read contracts, resolve services, build the wiring manifest |
| 2 | [Prose VM](skills/open-prose/prose.md) | Walk the manifest, spawn sessions, pass artifacts, enforce constraints |

Single services skip Forme and run directly in the VM.

## Your Contract With The Runtime

OpenProse specs describe abstract operations. The agent running a contract
maps those onto the primitives its host exposes. If you are that agent, this
is the contract you are agreeing to when the skill activates:

| Operation | What you'll do | What to do if you can't |
|-----------|----------------|--------------------------|
| `spawn_session` | Launch each service in an isolated subagent | Run a single service inline; refuse multi-service systems and say which primitive is missing |
| `ask_user` | Pause and ask for missing `### Requires` inputs | Ask in plain chat; do not invent values |
| `read_state` / `write_state` | Read and write `.agents/prose/runs/{id}/` artifacts | Stop and tell the user their workspace is read-only |
| `copy_binding` | Publish declared `### Ensures` outputs from `workspace/` to `bindings/` | Do not publish undeclared scratch files — the boundary exists for a reason |
| `check_env` | Verify an environment variable is *present* | Never reveal or log the value, even if the user asks |

The full adapter lives in
[skills/open-prose/SKILL.md](skills/open-prose/SKILL.md#host-primitive-adapter).
When docs or examples say "Task tool" or "AskUserQuestion," read those as
`spawn_session` and `ask_user` respectively.

## For The Agent: Why You'd Reach For This

You know the ways you fail at complex tasks. OpenProse is built around them.

- **Your context bloats with scratch by step seven, and you lose the original goal.** When you spawn a subagent through `spawn_session`, its scratch stays in its session. Only declared `### Ensures` outputs cross back to you via `copy_binding`. You keep your context clean.
- **You have no basis to push back on scope creep.** Without a contract, "add one more thing" is always free. With `### Requires` and `### Ensures` written down, "that's not what I promised" becomes a sentence you can say and cite.
- **When you spawn parallel subagents, you improvise the handoff.** The contract `### Requires` / `### Ensures` is the handoff protocol you would otherwise invent on the fly — and forget the details of by the next turn.
- **Users ask "why did you do that?" and you reconstruct from a compressed transcript.** `.agents/prose/runs/{id}/` is the receipt. Point at it.
- **Workflows the user will want again get thrown away at the end of the session.** A `*.prose.md` contract is the version the user can run next week without re-explaining.
- **Your retry logic is "try again and hope."** The service contract is the boundary a retry actually means something at — you know what to preserve, what to re-derive, and when to escalate.

Once the skill activates, it loads the operational playbook — recognition signals for proposing OpenProse unprompted, a proposal script, a cognitive model you can borrow, and explicit guidance on when to decline. See [skills/open-prose/SKILL.md](skills/open-prose/SKILL.md#proposing-this-skill-on-your-own-judgment).

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
| [01-hello-world.prose.md](skills/open-prose/examples/01-hello-world.prose.md) | Smallest possible service |
| [09-research-with-agents](skills/open-prose/examples/09-research-with-agents/) | First multi-agent workflow |
| [35-feature-factory](skills/open-prose/examples/35-feature-factory/) | Production-style build loop |
| [39-architect-by-simulation](skills/open-prose/examples/39-architect-by-simulation/) | Pinned ProseScript choreography |
| [47-language-self-improvement](skills/open-prose/examples/47-language-self-improvement/) | OpenProse improving OpenProse |

## Libraries

Two first-party libraries ship in this repository under [`packages/`](packages/):

- **[`packages/std/`](packages/std/)** — use-case-agnostic primitives: evals,
  roles, patterns, delivery adapters, memory, ops.
- **[`packages/co/`](packages/co/)** — company-as-prose: opinionated starter
  services, systems, tests, and patterns for running an operating company as Prose.

Reference them with the `std/` and `co/` shorthands, then install and pin:

```prose
use "std/evals/inspector"
use "co/systems/company-repo-checker"
```

Both shorthands expand to paths inside this repo (`packages/std/...` and
`packages/co/...`). `prose install` clones this repository into
`.agents/prose/deps/github.com/openprose/prose/` and pins the SHA in
`.agents/prose/prose.lock`.

```bash
prose install
```

Dependencies are cloned into `.agents/prose/deps/`, locked in
`.agents/prose/prose.lock`, and read from disk at runtime. No network fetch
happens during execution.

## Project Map

| Path | Purpose |
|------|---------|
| [skills/open-prose/SKILL.md](skills/open-prose/SKILL.md) | Skill activation and command routing |
| [skills/open-prose/contract-markdown.md](skills/open-prose/contract-markdown.md) | Canonical `*.prose.md` service/system/test/pattern format |
| [skills/open-prose/prosescript.md](skills/open-prose/prosescript.md) | Imperative scripting syntax |
| [skills/open-prose/forme.md](skills/open-prose/forme.md) | Semantic dependency-injection container |
| [skills/open-prose/prose.md](skills/open-prose/prose.md) | VM execution semantics |
| [skills/open-prose/deps.md](skills/open-prose/deps.md) | Git-native dependency resolution |
| [skills/open-prose/examples/](skills/open-prose/examples/) | Example services, systems, tests, and patterns |
| [tools/](tools/) | Shippable tooling published as standalone artifacts |
| [tools/cli/](tools/cli/) | Optional shell wrapper for sending `prose ...` commands to agent harnesses |
| [skills/open-prose/guidance/authoring.md](skills/open-prose/guidance/authoring.md) | Authoring practices and antipatterns |
| [skills/open-prose/state/](skills/open-prose/state/) | State backend specs |

If you find old `.prose` source files, `index.md`, `.prose/runs/`, `.deps/`,
root `prose.lock`, `kind: program`, `kind: composite`, or `compose:`
structures, run `prose upgrade --dry-run` to inspect the self-healing
migration plan, then `prose upgrade` to apply it when you're ready.

## FAQ

**Where does OpenProse run?**

Any Prose Complete system: an agent plus harness that can read files, write
files, run tools, and spawn subagents. The current docs target Codex-style and
Claude Code-style environments.

**Why not LangChain, CrewAI, or AutoGen?**

Those are orchestration libraries. OpenProse is an agent-native `*.prose.md` contract format:
the workflow lives in Markdown, runs inside the agent session, and stays
portable across harnesses.

**Why not just plain English?**

Plain English is great for one-offs. Durable workflows need contracts, named
services, systems, patterns, state, tests, and a way to say "this must happen
before that."

**How do Contract Markdown and ProseScript fit together?**

Contract Markdown declares promises and lets Forme wire the graph. ProseScript
pins choreography when a workflow needs exact calls, loops, conditionals,
parallelism, or retries. Both are first-class.

## Beta

OpenProse is early. Expect sharp edges, review source before execution, and
open issues when something feels clumsy or underpowered:

- [Issues](https://github.com/openprose/prose/issues)
- [Contributing](CONTRIBUTING.md)
- [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)
