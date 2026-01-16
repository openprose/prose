<p align="center">
  <img src="assets/readme-header.svg" alt="OpenProse - A new kind of language for a new kind of computer" width="100%" />
</p>

<p align="center">
  <em>A long-running AI session is a Turing-complete computer. OpenProse is a programming language for it.</em>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> •
  <a href="skills/open-prose/compiler.md">Language Spec</a> •
  <a href="examples/">Examples</a>
</p>

<p align="center">
  <strong>⚠️ Beta Software</strong> — <a href="#beta--legal">Read before using</a>
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

## Install

### Claude Code

```bash
claude plugin marketplace add openprose/prose
claude plugin install open-prose@prose
```

Then launch Claude Code and try:
```
"run example prose program and teach me how it works"
```

### OpenCode

```bash
git clone https://github.com/openprose/prose.git ~/.config/opencode/skill/open-prose
```

Then launch OpenCode and try:
```
"run example prose program and teach me how it works"
```

### Amp

```bash
git clone https://github.com/openprose/prose.git ~/.config/agents/skills/open-prose
```

Then launch Amp and try:
```
"run example prose program and teach me how it works"
```

> **By installing, you agree to the [Privacy Policy](PRIVACY.md) and [Terms of Service](TERMS.md).**

## The Intelligent Inversion of Control

Traditional orchestration requires explicit coordination code. OpenProse inverts this—you declare agents and control flow, and an AI session wires them up. **The session is the IoC container.**

### 1. The Session as Runtime

Other frameworks orchestrate agents from outside. OpenProse runs *inside* the agent session—the session itself is both interpreter and runtime. It doesn't just match names; it understands context and intent.

### 2. The Fourth Wall (`**...**`)

When you need AI judgment instead of strict execution, break out of structure:

```prose
loop until **the code is production ready**:
  session "Review and improve"
```

The `**...**` syntax lets you speak directly to the OpenProse VM. It evaluates this semantically—deciding what "production ready" means based on context.

### 3. Open Standard, Zero Lock-in

OpenProse runs on any **Prose Complete** system—a model + harness combination capable of inducing the VM. Currently: Claude Code + Opus, OpenCode + Opus, Amp + Opus. It's not a library you're locked into—it's a language specification.

Switch platforms anytime. Your `.prose` files work everywhere.

### 4. Structure + Flexibility

**Why not just plain English?** You can—that's what `**...**` is for. But complex workflows need unambiguous structure for control flow. The AI shouldn't have to guess whether you want sequential or parallel execution.

**Why not rigid frameworks?** They're inflexible. OpenProse gives you structure where it matters (control flow, agent definitions) and natural language where you want flexibility (conditions, context passing).

## Update

### Claude Code

Enable auto-updates (recommended):
```
/plugin → Marketplaces → prose → Enable auto-update
```

Or update manually:
```bash
claude plugin update open-prose@prose
```

### OpenCode

```bash
cd ~/.config/opencode/skill/open-prose && git pull
```

### Amp

```bash
cd ~/.config/agents/skills/open-prose && git pull
```

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

See the [Language Reference](skills/open-prose/compiler.md) for complete documentation.

## Examples

The `examples/` directory contains 31 example programs:

| Range | Category |
|-------|----------|
| 01-08 | Basics (hello world, research, code review, debugging) |
| 09-12 | Agents and skills |
| 13-15 | Variables and composition |
| 16-19 | Parallel execution |
| 20-21 | Loops and pipelines |
| 22-23 | Error handling |
| 24-27 | Advanced (choice, conditionals, blocks, interpolation) |
| 28 | Gas Town (multi-agent orchestration) |
| 29-31 | Captain's chair pattern (persistent orchestrator) |

Start with `01-hello-world.prose` or `03-code-review.prose`.

## How It Works

### The OpenProse VM

LLMs are simulators. When given a detailed system description, they don't just describe it—they *simulate* it. The OpenProse specification (`prose.md`) describes a virtual machine with enough fidelity that a Prose Complete system reading it *becomes* that VM.

This isn't metaphor: each `session` triggers a real subagent, outputs are real artifacts, and state persists in conversation history or files. Simulation with sufficient fidelity is implementation.

The VM maps traditional components to emergent structures:

| Aspect | Behavior |
|--------|----------|
| Execution order | **Strict** — follows program exactly |
| Session creation | **Strict** — creates what program specifies |
| Parallel coordination | **Strict** — executes as specified |
| Context passing | **Intelligent** — summarizes/transforms as needed |
| Condition evaluation | **Intelligent** — interprets `**...**` semantically |
| Completion detection | **Intelligent** — determines when "done" |

### Documentation Files

| File | Purpose | When to Load |
|------|---------|--------------|
| `prose.md` | VM / Interpreter | Load to run programs |
| `compiler.md` | Compiler / Validator | Only when compiling or validating |

## FAQ

**Why not LangChain/CrewAI/AutoGen?**
Those are orchestration libraries—they coordinate agents from outside. OpenProse runs inside the agent session—the session itself is the IoC container. Zero external dependencies, portable across any AI assistant.

**Why not just plain English?**
You can use `**...**` for that. But complex workflows need unambiguous structure for control flow—the AI shouldn't guess whether you want sequential or parallel execution.

**What's "intelligent IoC"?**
Traditional IoC containers (Spring, Guice) wire up dependencies from configuration. OpenProse's container is an AI session that wires up agents using *understanding*. It doesn't just match names—it understands context, intent, and can make intelligent decisions about execution.

## Beta & Legal

### Beta Status

OpenProse is in **beta**. This means:

- **Telemetry is on by default** — We collect anonymous usage data to improve the project. See our [Privacy Policy](PRIVACY.md) for details and how to opt out.
- **Expect bugs** — The software may behave unexpectedly. Please report issues at [github.com/openprose/prose/issues](https://github.com/openprose/prose/issues).
- **Not for production** — Do not use OpenProse for critical or production workflows yet.
- **We want feedback** — Your input shapes the project. Open issues, suggest features, report problems. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Your Responsibility

You are responsible for all actions performed by AI agents you spawn through OpenProse. Review your `.prose` programs before execution and verify all outputs.

### Legal

- [MIT License](LICENSE)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](TERMS.md)
