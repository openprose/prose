# OpenProse Help

Load this file when a user invokes `prose help` or asks about OpenProse.

---

## Welcome

OpenProse is a programming language for AI sessions. You write structured systems that orchestrate AI agents, and the VM (this session) executes them by spawning real subagents.

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
  1. "Run a service/system" - "I have a service or system file to execute"
  2. "Build something new" - "Help me create a service or system for a specific task"
  3. "Learn the syntax" - "Show me examples and explain how it works"
  4. "Explore possibilities" - "What can OpenProse do?"
```

**After the user responds:**

- **Run a service/system**: Ask for the file path, then load `prose.md` and execute
- **Build something new**: Ask them to describe their task, then help write a service or system (load `guidance/authoring.md`)
- **Learn the syntax**: Show examples from `examples/`, explain the VM model
- **Explore possibilities**: Walk through key examples like `37-the-forge/`

---

## Available Commands

| Command | What it does |
|---------|--------------|
| `prose run <file.prose.md>` | Run a service or system |
| `prose lint <file.prose.md>` | Validate structure, schema, and contracts |
| `prose preflight <file.prose.md>` | Check dependencies and environment |
| `prose test <test.prose.md>` | Run tests with assertions |
| `prose inspect <run-id>` | Evaluate a completed run |
| `prose status` | Show active IR, diagnostics, trigger plan, recent runs, and responsibility status/pressure |
| `prose install` | Install dependencies from `use` statements into `<openprose-root>/deps/` |
| `prose install --update` | Update pinned dependencies to latest |
| `prose upgrade --dry-run` | Inspect files and report the migration plan |
| `prose upgrade` | Apply the migration plan |
| `prose help` | This help -- guides you to what you need |
| `prose examples` | Browse and run example systems |

---

## Quick Start

**Run an example:**
```
prose run examples/01-hello-world.prose.md
```

**Create your first service or system:**
```
prose help
-> Select "Build something new"
-> Describe what you want to automate
```

Default project source lives under `<openprose-root>/src/`. Multi-file systems
conventionally start at `<openprose-root>/src/{system}/index.prose.md`; runs are
written to `<openprose-root>/runs/`.

**Use a library service or system:**
```text
prose run std/evals/inspector -- subject: 20260406-201439-1a3369
```

**Add a dependency:**
```prose
use "github.com/owner/repo/path/to/service"
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

### Why not all YAML?

We started with YAML. The problem: loops, conditionals, and variable declarations aren't self-evident in YAML. More fundamentally, YAML optimizes for machine parseability. OpenProse optimizes for intelligent machine legibility. It uses YAML only where structured nesting is doing real work, such as pattern instances in `### Services`. Contracts themselves stay in Markdown because they need to be understood, not merely parsed.

### How do dependencies work?

OpenProse uses a git-native dependency model -- any git host works, written explicitly as `host/owner/repo/path` (e.g. `github.com/alice/research`). A system can reference dependencies with `use "host/owner/repo/path"`, dependency-like entries in `### Services`, or `pattern:` references. Run `prose install` to clone dependencies into `<openprose-root>/deps/` and pin their versions in `<openprose-root>/prose.lock`. The lockfile is committed to git; `<openprose-root>/deps/` is gitignored (it's a cache, reproducible from the lockfile). `std/` is shorthand for `github.com/openprose/prose/packages/std/` (the standard library) and `co/` is shorthand for `github.com/openprose/prose/packages/co/` (company-as-prose). At runtime, dependencies are read from disk only -- no network calls. If deps are missing, `prose run` errors and tells you to run `prose install`.

### Why not LangChain/CrewAI/AutoGen?

Those are orchestration libraries -- they coordinate agents from outside.
OpenProse runs inside the agent session -- the session itself is the IoC
container. `prose run ...` is therefore a command to the agent host, not
necessarily a shell binary. From a shell, wrap it in a Prose Complete runner
such as `claude -p "prose run system.prose.md"` or
`codex exec "prose run system.prose.md"`. Switch from one supported harness to
another and the system should still read the same; only the host primitive
adapter changes.

---

## Syntax at a Glance

### Contract Markdown (`*.prose.md` files)

Services and systems are `*.prose.md` files with tiny YAML identity frontmatter and readable `###` sections. The Forme Container wires systems; the Prose VM executes services and systems.

**Identity frontmatter:**

```yaml
---
name: my-service
kind: service          # service | system | test | pattern
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

**System (multi-service):**

```markdown
---
name: deep-research
kind: system
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

Each entry in `### Services` is a separate service or subsystem `*.prose.md` file. Forme auto-wires them by matching `### Requires` to `### Ensures` across services and systems.

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

### Expects Not

- `findings`: includes uncited claims
```

Tests use semantic assertions over observable outputs, not exact wording.

**Patterns:**

```markdown
---
name: worker-critic
kind: pattern
---
```

Patterns define reusable agent design patterns with slots, config, invariants,
and delegation rules. They are not run directly; systems instantiate them with
`pattern:` declarations in `### Services`. A nested pattern declaration may
appear inside another pattern instance's `with:` block as a slot value.

### ProseScript (`### Execution`)

ProseScript is the imperative layer. Use it inside `### Execution` when a Contract Markdown service or system needs pinned choreography.

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

The `examples/` directory contains a mixture of canonical Contract Markdown,
system patterns, and feature demos:

| Range | Category |
|-------|----------|
| 01-04 | Basics -- single-service files (hello world, research, code review, write-and-refine) |
| 09-13 | Agents, skills, imports, shape boundaries, variables |
| 16 | Parallel execution (multi-service with synthesizer) |
| 22-25 | Error handling, retry, choice blocks, conditionals |
| 29-30 | Captain's chair pattern (persistent orchestrator) |
| 32-37 | Production workflows (PR review, auto-fix, content pipeline, feature factory, bug hunter, the forge) |
| 38-39 | Skill scanning, architect-by-simulation |
| 40-43 | RLM patterns (self-refine, divide-conquer, filter-recurse, pairwise) |
| 44-50 | Production and meta (UX testing, plugin release, workflow crystallizer, language self-improvement, habit miner, retrospective, interactive tutor) |
| -- | Bonus: patterns-demo, multi-service-single-file, dependency-import, test-demo, wiring-declaration |

**Recommended starting points:**
- `01-hello-world.prose.md` -- Simplest possible service (single session, no inputs)
- `16-parallel-reviews/` -- Multi-service parallel execution with auto-wiring
- `37-the-forge/` -- Watch AI build a web browser (9-phase execution block)
- `test-demo.prose.md` -- See how `kind: test` works with fixtures and assertions
- `multi-service-single-file.prose.md` -- See `##` inline service boundaries
- `patterns-demo/` -- See a self-contained worker-critic pattern
