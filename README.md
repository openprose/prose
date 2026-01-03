<p align="center">
  <img src="https://raw.githubusercontent.com/openprose/open-prose/main/assets/readme-header.svg" alt="OpenProse - A new kind of language for a new kind of computer" width="100%" />
</p>

<p align="center">
  <em>A long-running AI session is a Turing-complete computer. OpenProse is a programming language for it.</em>
</p>

<p align="center">
  <a href="https://prose.md">Website</a> •
  <a href="skills/open-prose/prose.md">Language Spec</a> •
  <a href="examples/">Examples</a>
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

The `**...**` syntax lets you speak directly to the interpreter. The orchestrator evaluates this semantically—it decides what "production ready" means based on context.

### 3. Open Standard, Zero Lock-in

OpenProse is a skill you import into Claude Code, OpenCode, Codex, Amp, or any compatible AI assistant. It's not a library you're locked into—it's a language specification.

Switch platforms anytime. Your `.prose` files work everywhere.

### 4. Structure + Flexibility

**Why not just plain English?** You can—that's what `**...**` is for. But complex workflows need unambiguous structure for control flow. The AI shouldn't have to guess whether you want sequential or parallel execution.

**Why not rigid frameworks?** They're inflexible. OpenProse gives you structure where it matters (control flow, agent definitions) and natural language where you want flexibility (conditions, context passing).

## Install (Claude Code)

```bash
/plugin marketplace add git@github.com:openprose/prose.git
/plugin install prose@open-prose
```

Then:

```
"Run the code review example from OpenProse"
"Execute my-workflow.prose"
"Write me an OpenProse workflow for debugging"
```

## Language Features

| Feature | Example |
|---------|---------|
| Agents | `agent researcher: model: sonnet` |
| Sessions | `session "prompt"` or `session: agent` |
| Parallel | `parallel:` blocks with join strategies |
| Variables | `let x = session "..."` |
| Context | `context: [a, b]` or `context: { a, b }` |
| Fixed Loops | `repeat 3:` and `for item in items:` |
| Unbounded Loops | `loop until **condition**:` |
| Error Handling | `try`/`catch`/`finally`, `retry` |
| Pipelines | `items \| map: session "..."` |
| Conditionals | `if **condition**:` / `choice **criteria**:` |

See the [Language Reference](skills/open-prose/prose.md) for complete documentation.

## Examples

The plugin ships with 27 ready-to-use examples:

| Range | Category |
|-------|----------|
| 01-08 | Basics (hello world, research, code review, debugging) |
| 09-12 | Agents and skills |
| 13-15 | Variables and composition |
| 16-19 | Parallel execution |
| 20 | Fixed loops |
| 21 | Pipeline operations |
| 22-23 | Error handling |
| 24-27 | Advanced (choice, conditionals, blocks, interpolation) |

Start with `01-hello-world.prose` or `03-code-review.prose`.

## How It Works

### The Orchestrator

The orchestrator is an AI session that acts as an intelligent IoC container:

| Aspect | Behavior |
|--------|----------|
| Execution order | **Strict** — follows program exactly |
| Session creation | **Strict** — creates what program specifies |
| Parallel coordination | **Strict** — executes as specified |
| Context passing | **Intelligent** — summarizes/transforms as needed |
| Condition evaluation | **Intelligent** — interprets `**...**` semantically |
| Completion detection | **Intelligent** — determines when "done" |

### Documentation Files

| File | Purpose | When to Read |
|------|---------|--------------|
| `interpreter.md` | Execution semantics | Always, for running programs |
| `prose.md` | Full language spec | For compilation, validation, or syntax questions |

## FAQ

**Why not LangChain/CrewAI/AutoGen?**
Those are orchestration libraries—they coordinate agents from outside. OpenProse runs inside the agent session—the session itself is the IoC container. Zero external dependencies, portable across any AI assistant.

**Why not just plain English?**
You can use `**...**` for that. But complex workflows need unambiguous structure for control flow—the AI shouldn't guess whether you want sequential or parallel execution.

**What's "intelligent IoC"?**
Traditional IoC containers (Spring, Guice) wire up dependencies from configuration. OpenProse's container is an AI session that wires up agents using *understanding*. It doesn't just match names—it understands context, intent, and can make intelligent decisions about execution.

## License

MIT
