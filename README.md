<p align="center">
  <img src="https://openprose.ai/readme-header.png" alt="OpenProse - Author Outcomes" width="100%" />
</p>

<p align="center">
  <strong>Write the future as a Markdown contract agents can run, review, and maintain.</strong>
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
> and not necessarily a shell binary. `prose run` executes `kind: service` and
> `kind: system` contracts. `kind: gateway`, `kind: test`, `kind: pattern`, and
> `kind: responsibility` have their own routing and are not ordinary run targets. When a `prose` command fires
> inside an agent session, interpret it directly: read the Markdown contract,
> embody the OpenProse VM, spawn subagents for declared services, pass
> artifacts between them, and write the run under `<openprose-root>/runs/`. You need:
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

## OpenProse Root

Every OpenProse workspace has an **OpenProse root**. All OpenProse filesystem
paths are relative to `<openprose-root>`:

| Path | Purpose |
|------|---------|
| `src/` | Authored intent: services, systems, tests, patterns, responsibilities, and supporting source |
| `dist/` | Compiled intent consumed by deterministic runtime commands |
| `runs/` | Activation receipts for bounded VM runs |
| `state/` | Durable cross-run state |
| `state/agents/` | Durable cross-run agents |
| `state/responsibilities/` | Durable responsibility status and pressure |
| `deps/` | Installed dependencies |
| `prose.lock` | Dependency lockfile |
| `.env` | Local runtime environment variables |

Native repositories use the repository root as `<openprose-root>`. Attached
repositories use `repo/.agents/prose`. User-global OpenProse state uses
`~/.agents/prose`.

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

Create `src/hello.prose.md`:

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
prose run src/hello.prose.md
```

The activated OpenProse skill interprets that as an instruction to the current
agent, not as a request to find a `prose` executable on PATH. OpenProse writes
the run state to `<openprose-root>/runs/{run-id}/`, including inputs, outputs, service
workspaces, and the execution log.

From a shell outside an agent session, pass the same instruction to a Prose
Complete runner:

```bash
claude -p "prose run src/hello.prose.md"
codex exec "prose run src/hello.prose.md"
```

The [CLI package](tools/cli/) is the shell entrypoint for that same command
language. `prose run` forwards bounded VM activations to the selected harness;
Responsibility Runtime commands add a thin deterministic host layer for
compiling, serving, and inspecting repository IR. The CLI checks for the
`open-prose` skill before invoking a harness and can install the selected
provider's global skill target automatically; run `prose doctor` to inspect the
local setup. Automatic skill install uses `npx`; in a minimal shell where
`prose` is available but `npx` is not, install the skill from this checkout:

```bash
mkdir -p "$HOME/.codex/skills" "$HOME/.agents/skills" "$HOME/.claude/skills"
ln -sfn "$PWD/skills/open-prose" "$HOME/.codex/skills/open-prose"
ln -sfn "$PWD/skills/open-prose" "$HOME/.agents/skills/open-prose"
ln -sfn "$PWD/skills/open-prose" "$HOME/.claude/skills/open-prose"
prose doctor
```

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
| `runs/` | Auditable activation receipts for every bounded VM run |
| `state/` | Durable cross-run state for agents, responsibilities, and runtime continuity |

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
| 1 | [Forme](skills/open-prose/forme.md) | Read contracts, resolve services, build the compiled Forme manifest |
| 2 | [Prose VM](skills/open-prose/prose.md) | Walk the compiled manifest, spawn sessions, pass artifacts, enforce constraints |

Single services skip Forme and run directly in the VM.

## Responsibility Runtime Direction

OpenProse enables Responsibility-Oriented Architecture: standing goals that
must remain true over time.

Not every OpenProse program is responsibility-oriented. A single service,
composed system, test, or pattern can still run normally. Responsibility
Runtime is the continuity layer for repositories that need standing goals to
be checked, maintained, and restored across bounded runs:

| Command | Role |
|---------|------|
| `prose compile` | Run the bundled OpenProse compiler program, emit `<openprose-root>/dist/manifest.next.json`, and validate it before success |
| `prose serve` | Load active IR and run local cron and HTTP trigger adapters |
| `prose run` | Execute one bounded OpenProse VM activation |
| `prose write` | Author a validated OpenProse program package from rough English/pseudo-Prose, asking targeted shape/root questions in interactive hosts and returning `unresolved-intent` only for non-interactive missing decisions |
| `prose status` | Inspect active IR, diagnostics, trigger plan, recent runs, and responsibility status/pressure |

The compiled Responsibility Runtime manifest preserves responsibilities as
semantic sections, emits concrete triggers and activation intent, and includes
structured Forme manifests for fulfillment systems. `prose serve` launches
judge activations as normal bounded runs of the bundled judge service, records
responsibility status under `<openprose-root>/state/responsibilities/`, and
turns unhealthy status into deduped pressure that launches ordinary fulfillment
runs. The first live adapters are local cron timers and HTTP webhook/API
routes. `prose compile` writes `<openprose-root>/dist/manifest.next.json`; promote it to
`<openprose-root>/dist/manifest.active.json` when you want `prose serve`
to consume it.

`prose status` is deterministic local inspection. It reads compiled IR and
runtime receipts without running the VM or registering live adapters.

The design doctrine is:

```text
Markdown source defines intent.
Skill and interpreter docs define semantics.
Compiler programs lower semantics into IR.
The harness serves IR.
Runs interpret and act.
```

In Responsibility Runtime, Responsibilities, Reactor, and Forme are not
competing frameworks:

- **Responsibilities** define standing goals: goals that must remain true over
  time.
- **Reactor** is the evented reconciliation model: timers, webhooks, queues,
  file changes, judge drift, and manual requests are all events.
- **Forme** wires the services and systems used to fulfill responsibilities.

The harness should stay deterministic: validate IR, register triggers, receive
events, and launch normal runs. Semantic intelligence belongs in Markdown,
compiler programs, and bounded VM activations.

## Your Contract With The Runtime

OpenProse specs describe abstract operations. The agent running a contract
maps those onto the primitives its host exposes. If you are that agent, this
is the contract you are agreeing to when the skill activates:

| Operation | What you'll do | What to do if you can't |
|-----------|----------------|--------------------------|
| `spawn_session` | Launch each service in an isolated subagent | Run a single service inline; refuse multi-service systems and say which primitive is missing |
| `ask_user` | Pause and ask for missing `### Requires` inputs | Ask in plain chat; do not invent values |
| `read_state` / `write_state` | Read and write `<openprose-root>/runs/{id}/` artifacts and `<openprose-root>/state/` data | Stop and tell the user their workspace is read-only |
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
- **Users ask "why did you do that?" and you reconstruct from a compressed transcript.** `<openprose-root>/runs/{id}/` is the receipt. Point at it.
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
| [stargazer-outreach](skills/open-prose/examples/stargazer-outreach/) | GitHub stars to qualified, thoughtful outreach |
| [incident-briefing-room](skills/open-prose/examples/incident-briefing-room/) | Incident updates, impact, and next actions |
| [customer-risk-radar](skills/open-prose/examples/customer-risk-radar/) | Customer risk monitoring before renewals or escalations |
| [release-readiness](skills/open-prose/examples/release-readiness/) | Release evidence, risk, notes, and rollback context |
| [compliance-evidence-tracker](skills/open-prose/examples/compliance-evidence-tracker/) | Audit evidence freshness and gap tracking |
| [grant-radar](https://github.com/openprose/grant-finder/tree/main/examples/openprose) | External example: source-cited funding research for labs, startups, and technical teams |

## Libraries

Two first-party libraries ship in this repository under [`packages/`](packages/):

- **[`packages/std/`](packages/std/)** — use-case-agnostic primitives: evals,
  roles, patterns, delivery adapters, memory, ops.
- **[`packages/co/`](packages/co/)** — company-as-prose: opinionated starter
  services, systems, tests, and patterns for running an operating company as Prose.

Reference them with the `std/` and `co/` shorthands, then install and pin:

```prose
use "std/evals/inspector"
use "std/evals/prose-contributor"
use "co/systems/company-repo-checker"
```

Both shorthands expand to paths inside this repo (`packages/std/...` and
`packages/co/...`). `prose install` clones this repository into
`<openprose-root>/deps/github.com/openprose/prose/` and pins the SHA in
`<openprose-root>/prose.lock`.

```bash
prose install
```

Dependencies are cloned into `<openprose-root>/deps/`, locked in
`<openprose-root>/prose.lock`, and read from disk at runtime. No network fetch
happens for dependency resolution during execution.

If a run teaches an agent how OpenProse itself should improve, use
`std/evals/prose-contributor`. It consumes run evidence, makes one focused
change, verifies it, and opens a draft PR after explicit approval to use the
current GitHub identity.

## Project Map

| Path | Purpose |
|------|---------|
| [skills/open-prose/SKILL.md](skills/open-prose/SKILL.md) | Skill activation and command routing |
| [skills/open-prose/contract-markdown.md](skills/open-prose/contract-markdown.md) | Canonical `*.prose.md` service/system/gateway/test/pattern/responsibility format |
| [skills/open-prose/prosescript.md](skills/open-prose/prosescript.md) | Imperative scripting syntax |
| [skills/open-prose/forme.md](skills/open-prose/forme.md) | Semantic dependency-injection container |
| [skills/open-prose/prose.md](skills/open-prose/prose.md) | VM execution semantics |
| [skills/open-prose/deps.md](skills/open-prose/deps.md) | Git-native dependency resolution |
| [skills/open-prose/examples/](skills/open-prose/examples/) | Example services, systems, tests, and patterns |
| [tools/](tools/) | Shippable tooling published as standalone artifacts |
| [tools/cli/](tools/cli/) | Optional shell wrapper for sending `prose ...` commands to agent harnesses |
| [skills/open-prose/guidance/authoring.md](skills/open-prose/guidance/authoring.md) | Authoring practices and antipatterns |
| [skills/open-prose/state/](skills/open-prose/state/) | State backend specs |

Use `src/` for authored intent, `dist/` for compiled intent, `runs/` for
activation receipts, `state/` for durable cross-run state, and `deps/` plus
`prose.lock` for installed dependencies.

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
