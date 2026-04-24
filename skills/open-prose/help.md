# OpenProse Help

Load this file when a user invokes `prose help` or asks about OpenProse.

---

## Welcome

OpenProse is a programming language for AI sessions. You write structured programs that orchestrate AI agents, and the VM (this session) executes them by spawning real subagents.

**A long-running AI session is a Turing-complete computer. OpenProse is a programming language for it.**

---

## What Do You Want to Automate?

When a user invokes `prose help`, guide them toward defining what they want to
build. Use the host's user-question primitive when available; otherwise ask the
question plainly in chat:

```
Question: "What would you like to automate with OpenProse?"
Header: "Goal"
Options:
  1. "Run a workflow" - "I have a program file to execute"
  2. "Build something new" - "Help me create a program for a specific task"
  3. "Learn the syntax" - "Show me examples and explain how it works"
  4. "Explore possibilities" - "What can OpenProse do?"
```

**After the user responds:**

- **Run a workflow**: Ask for the file path, then load `prose.md` and execute
- **Build something new**: Ask them to describe their task, then help write a program (load `guidance/patterns.md`)
- **Learn the syntax**: Show curated examples from `../../examples/README.md`, explain the VM model
- **Explore possibilities**: Walk through the modern examples such as `selective-recompute.prose.md` and `approval-gated-release.prose.md`

---

## Available Commands

| Command | What it does |
|---------|--------------|
| `prose run <program.md>` | Run a program |
| `prose run <program.prose>` | Run a ProseScript program |
| `prose lint <program.md>` | Validate structure, schema, and contracts |
| `prose preflight <program.md>` | Check dependencies and environment |
| `prose test <program.md>` | Run tests with assertions |
| `prose inspect <run-id>` | Evaluate a completed run |
| `prose status` | Show recent runs |
| `prose install` | Install dependencies from `use` statements into `.deps/` |
| `prose install --update` | Update pinned dependencies to latest |
| `prose migrate <file.prose>` | Wrap ProseScript in Contract Markdown |
| `prose help` | This help -- guides you to what you need |

---

## Quick Start

**Inspect a local example:**
```bash
bun run prose compile examples/hello.prose.md
```

**Create your first program:**
```text
prose help
-> Select "Build something new"
-> Describe what you want to automate
```

**Use a library program:**
```text
prose run std/evals/inspector -- subject: 20260406-201439-1a3369
```

**Add a dependency:**
```markdown
use "owner/repo/path/to/service.md"
```
Then run `prose install` to fetch and pin it.

---

## FAQs

### What AI assistants are supported?

Codex, Claude Code, OpenCode, Amp, and similar agent harnesses. Any host that
runs a sufficiently intelligent model and supports the OpenProse primitives
(`spawn_session`, filesystem state, tool calls, and user input) is considered
"Prose Complete".

### How is this a VM?

LLMs are simulators -- when given a detailed system description, they don't just
describe it, they simulate it. The `prose.md` spec describes a VM with enough
fidelity that reading it induces simulation. But simulation with sufficient
fidelity is implementation: each session maps to a real `spawn_session` in the
host, outputs are real artifacts, and state persists in files. The simulation is
the execution.

### What's "intelligent IoC"?

Traditional IoC containers (Spring, Guice) wire up dependencies from configuration files. OpenProse's container is an AI session that wires up agents using understanding. It doesn't just match names -- it understands context, intent, and can make intelligent decisions about execution.

### Why not English?

English is already an agent framework -- we're not replacing it, we're structuring it. Plain English doesn't distinguish sequential from parallel, doesn't specify retry counts, doesn't scope variables. OpenProse uses English exactly where ambiguity is a feature (in contract descriptions), and structure everywhere else.

### Why not YAML?

We started with YAML. The problem: loops, conditionals, and variable declarations aren't self-evident in YAML. More fundamentally, YAML optimizes for machine parseability. OpenProse optimizes for intelligent machine legibility. It doesn't need to be parsed -- it needs to be understood. That's a different design target entirely.

### How do dependencies work?

OpenProse uses a git-native dependency model -- any git host works, written explicitly as `host/owner/repo/path` (e.g. `github.com/alice/research`). A program can reference dependencies with `use "host/owner/repo/path"`, dependency-like entries in `### Services`, or `compose:` paths. Run `prose install` to clone dependencies into `.deps/` and pin their versions in `prose.lock`. The lockfile is committed to git; `.deps/` is gitignored (it's a cache, reproducible from the lockfile). `std/` is shorthand for `github.com/openprose/prose/packages/std/` (the standard library) and `co/` is shorthand for `github.com/openprose/prose/packages/co/` (company-as-prose). At runtime, dependencies are read from disk only -- no network calls. If deps are missing, `prose run` errors and tells you to run `prose install`.

### Why not baseline orchestration packages?

Most agent packages are good at coordinating calls. OpenProse is trying to make
the workflow itself reviewable, typed, packageable, and reactive. That is why
it has contracts, IR, plan/graph surfaces, run records, and package metadata
instead of only runtime orchestration helpers.

OpenProse still runs inside the agent session -- the session itself is the IoC
container. `prose run ...` is therefore a command to the agent host, not
necessarily a shell binary. From a shell, wrap it in a Prose Complete runner
such as `claude -p "prose run program.md"` or
`codex exec "prose run program.md"`. Switch from one supported harness to
another and the program should still read the same; only the host primitive
adapter changes.

---

## Syntax at a Glance

### Contract Markdown (`.md` files)

Programs are `.md` files with tiny YAML identity frontmatter and readable `###` sections. The Forme Container reads contracts, auto-wires dependencies, and the Prose VM executes.

**Identity frontmatter:**

```yaml
---
name: my-service
kind: service          # service | program | test
---
```

**Sections:**

```markdown
### Runtime

- `persist`: project

### Shape

- `self`: evaluate, decide
- `delegates`:
  - `helper`: research
- `prohibited`: direct web scraping

### Requires

- `topic`: a research question to investigate

### Ensures

- `findings`: sourced claims from 3+ distinct sources
- each finding includes: confidence score 0-1

### Errors

- `no-results`: no relevant sources found

### Strategies

- when few sources found: broaden search terms

### Environment

- `API_KEY`: required for external service access
```

**Program (multi-service) entry point:**

```markdown
---
name: deep-research
kind: program
---

### Services

- `researcher`
- `critic`
- `synthesizer`

### Requires

- `question`: the question to investigate

### Ensures

- `report`: a concise answer with sources
```

Each service in the `services` list is a separate `.md` file. Forme auto-wires them by matching `### Requires` to `### Ensures` across components.

**Three levels of author control:**

1. **Contracts only** (default) -- Forme auto-wires everything from `### Requires` / `### Ensures`
2. **Wiring declaration** -- author adds a `### Wiring` section to pin specific connections
3. **Execution block** -- author adds a `### Execution` section with explicit `let`/`call` statements

**Test files:**

```markdown
---
name: test-my-service
kind: test
subject: my-service
---

### Fixtures

- `topic`: "quantum computing"

### Expects

- `findings`: mentions at least 3 sources
```

### ProseScript (`.prose` files and `### Execution`)

ProseScript is the imperative layer. Use it for standalone `.prose` files, or inside `### Execution` when a Contract Markdown program needs pinned choreography.

```prose
let research = call researcher
  topic: topic

parallel:
  let critique = call critic
    draft: research
  let factcheck = call fact-checker
    draft: research

let report = call synthesizer
  research: research
  critique: critique
  factcheck: factcheck

return report
```

Also valid: `session`, `agent`, `repeat`, `for`, `loop until`, `try/catch`, `if/elif/else`, `choice`, `block`, `do`, and pipelines. For complete syntax and validation rules, see `prosescript.md`.

---

## Examples

The curated examples now live at the repository root in `examples/`.

**Recommended starting points:**
- `examples/hello.prose.md` -- smallest useful typed service
- `examples/selective-recompute.prose.md` -- see target-output planning and recompute savings
- `examples/approval-gated-release.prose.md` -- see unsafe effects become visible gates
- `examples/company-intake.prose.md` -- see a compact company-as-code workflow

If the user wants the big picture first, point them to:

- `../../docs/README.md`
- `../../docs/why-and-when.md`
- `../../docs/diagrams/index.html`
