# OpenProse Help

Load this file when a user invokes `prose help` or asks about OpenProse.

---

## Welcome

OpenProse is a programming language for AI sessions. You write structured programs that orchestrate AI agents, and the VM (this session) executes them by spawning real subagents.

**A long-running AI session is a Turing-complete computer. OpenProse is a programming language for it.**

---

## What Do You Want to Automate?

When a user invokes `prose help`, guide them toward defining what they want to build. Use the AskUserQuestion tool:

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
- **Learn the syntax**: Show examples from `examples/`, explain the VM model
- **Explore possibilities**: Walk through key examples like `37-the-forge/`

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
| `prose examples` | Browse and run example programs |

---

## Quick Start

**Run an example:**
```
prose run examples/01-hello-world.md
```

**Create your first program:**
```
prose help
-> Select "Build something new"
-> Describe what you want to automate
```

**Use a library program:**
```bash
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

Codex, Claude Code, OpenCode, and Amp. Any harness that runs a sufficiently intelligent model and supports primitives like subagents is considered "Prose Complete".

### How is this a VM?

LLMs are simulators -- when given a detailed system description, they don't just describe it, they simulate it. The `prose.md` spec describes a VM with enough fidelity that reading it induces simulation. But simulation with sufficient fidelity is implementation: each session spawns a real subagent, outputs are real artifacts, state persists in conversation history or files. The simulation is the execution.

### What's "intelligent IoC"?

Traditional IoC containers (Spring, Guice) wire up dependencies from configuration files. OpenProse's container is an AI session that wires up agents using understanding. It doesn't just match names -- it understands context, intent, and can make intelligent decisions about execution.

### Why not English?

English is already an agent framework -- we're not replacing it, we're structuring it. Plain English doesn't distinguish sequential from parallel, doesn't specify retry counts, doesn't scope variables. OpenProse uses English exactly where ambiguity is a feature (in contract descriptions), and structure everywhere else.

### Why not YAML?

We started with YAML. The problem: loops, conditionals, and variable declarations aren't self-evident in YAML. More fundamentally, YAML optimizes for machine parseability. OpenProse optimizes for intelligent machine legibility. It doesn't need to be parsed -- it needs to be understood. That's a different design target entirely.

### How do dependencies work?

OpenProse uses a git-native dependency model -- GitHub is the registry. A program can reference dependencies with `use "owner/repo/path"`, dependency-like entries in `### Services`, or `compose:` paths. Run `prose install` to clone dependencies into `.deps/` and pin their versions in `prose.lock`. The lockfile is committed to git; `.deps/` is gitignored (it's a cache, reproducible from the lockfile). `std/` is shorthand for `openprose/std/` -- the standard library. At runtime, dependencies are read from disk only -- no network calls. If deps are missing, `prose run` errors and tells you to run `prose install`.

### Why not LangChain/CrewAI/AutoGen?

Those are orchestration libraries -- they coordinate agents from outside. OpenProse runs inside the agent session -- the session itself is the IoC container. This means zero external dependencies and portability across any AI assistant. Switch from Claude Code to Codex? Your programs still work.

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

The `examples/` directory contains ~50 Contract Markdown programs:

| Range | Category |
|-------|----------|
| 01-04 | Basics -- single-service programs (hello world, research, code review, write-and-refine) |
| 09-13 | Agents, skills, imports, permissions, variables |
| 16 | Parallel execution (multi-service with synthesizer) |
| 22-25 | Error handling, retry, choice blocks, conditionals |
| 29-30 | Captain's chair pattern (persistent orchestrator) |
| 32-37 | Production workflows (PR review, auto-fix, content pipeline, feature factory, bug hunter, the forge) |
| 38-39 | Skill scanning, architect-by-simulation |
| 40-43 | RLM patterns (self-refine, divide-conquer, filter-recurse, pairwise) |
| 44-50 | Production and meta (UX testing, plugin release, workflow crystallizer, language self-improvement, habit miner, retrospective, interactive tutor) |
| -- | Bonus: composites-demo, multi-service-single-file, registry-import, test-demo, wiring-declaration |

**Recommended starting points:**
- `01-hello-world.md` -- Simplest possible program (single service, no inputs)
- `16-parallel-reviews/` -- Multi-service parallel execution with auto-wiring
- `37-the-forge/` -- Watch AI build a web browser (9-phase execution block)
- `test-demo.md` -- See how `kind: test` works with fixtures and assertions
