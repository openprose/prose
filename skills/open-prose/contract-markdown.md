---
role: contract-markdown-format
summary: |
  Canonical Markdown format for OpenProse services, systems, tests, and
  patterns. Defines the header hierarchy, contract sections, and how Forme
  should extract services and systems from `*.prose.md` files.
see-also:
  - forme.md: Wiring semantics
  - prose.md: Execution semantics
  - prosescript.md: Imperative scripting layer for `### Execution`
  - guidance/tenets.md: Design reasoning
  - guidance/authoring.md: Authoring guidance
---

# Contract Markdown

Contract Markdown is the human-facing `*.prose.md` format for OpenProse services,
systems, tests, and patterns. It uses tiny YAML frontmatter for file
identity, then Markdown sections for the human-facing language: services,
contracts, runtime hints, shape, and execution.

The format optimizes for two readers:

1. Humans scanning a workflow.
2. Agents extracting contracts and wiring services and systems.

## Runnable Shapes

`prose run` accepts two authored shapes:

- **Service** — an atomic execution boundary: one contract, one session, one
  workspace. A service does work directly.
- **System** — a composition boundary: one contract whose implementation is a
  graph of services and systems. A system owns domain intent and concrete
  wiring.

A run starts from the file the caller invokes, which may be either a service or a system.

A **test** is a harness executed by `prose test`: it supplies fixtures, runs a
subject service or system, and evaluates assertions.

A **pattern** is not domain work by itself. It is a reusable agent design
pattern: slots, config, invariants, and delegation rules for how filled
services interact. Patterns are not run directly; systems instantiate them
inside `### Services`.

## Core Shape

````markdown
---
name: research-report
kind: service
---

### Requires

- `topic`: the question to investigate

### Ensures

- `report`: concise answer with sources

### Strategies

- when sources are thin: broaden search terms

### Execution

```prose
let findings = call researcher
  topic: topic

return findings
```
````

## Header Hierarchy

| Level | Meaning |
|-------|---------|
| `#` | Optional human title. Ignored by Forme unless no frontmatter `name` exists. |
| `##` | Inline service boundary in multi-service files. |
| `###` | Section inside the current service or system. |
| `####`+ | Free-form nested documentation inside a section. |

`##` is reserved for inline service names so files can contain several
services without ambiguous parsing. Contract sections use `###` so they work
uniformly in standalone service files and inside inline services.

## Canonical Sections

Forme and the Prose VM recognize these `###` sections case-insensitively:

| Section | Applies To | Purpose |
|---------|------------|---------|
| `### Description` | system, service, test, pattern | Human summary. Preserved for readers; not used as a contract |
| `### Services` | system | Services or systems Forme should resolve and wire |
| `### Requires` | system, service, test, pattern slots | Inputs or dependencies the caller/container must provide |
| `### Ensures` | system, service, pattern | Outputs or postconditions the service, system, or pattern commits to |
| `### Errors` | system, service | Declared failures the service or system may signal |
| `### Invariants` | system, service, pattern | Properties that must hold regardless of outcome |
| `### Strategies` | system, service, test | Guidance for judgment calls and edge cases |
| `### Environment` | system, service | Runtime variables supplied by host infrastructure |
| `### Runtime` | system, service | Execution hints such as `persist` and `model` |
| `### Memory` | service | Declared reads from and writes to persistent agent memory. Only meaningful when `### Runtime` sets `persist: project` or `persist: user` |
| `### Shape` | service | Capability boundaries: self, delegates, and prohibited work |
| `### Wiring` | system | Explicit Level 2 wiring declaration |
| `### Execution` | system, service | ProseScript choreography that pins execution |
| `### Fixtures` | test | Test inputs supplied without prompting |
| `### Expects` | test | Positive natural-language assertions |
| `### Expects Not` | test | Negative natural-language assertions |
| `### Slots` | pattern | Services a pattern requires from its caller |
| `### Config` | pattern | Pattern-level parameters and defaults |
| `### Delegation` | pattern | ProseScript or pseudocode describing slot interaction |

Unknown `###` sections are preserved as documentation. They are not contract
sections unless a future spec names them.

## File Extraction

Forme parses a file in this order:

1. Read YAML frontmatter for identity metadata (`name`, `kind`; `kind: test`
   files also declare `subject`).
2. Create the file-level service, system, test, or pattern from the frontmatter.
3. Attach all `###` sections before the first `##` to the file-level entry.
4. For every `## {name}` heading, create an inline service named `{name}`.
5. Attach subsequent `###` sections to that inline service until the next `##`.

Example:

````markdown
---
name: content-pipeline
kind: system
---

### Services

- `review`
- `polish`

### Requires

- `draft`: text to improve

### Ensures

- `final`: polished text

## review

### Shape

- `self`: read draft, write feedback
- `prohibited`: editing final copy

### Requires

- `draft`: text to review

### Ensures

- `feedback`: editorial notes

## polish

### Requires

- `draft`: original text
- `feedback`: editorial notes

### Ensures

- `final`: polished text
````

The file-level system requires `draft` and ensures `final`. It also
contains inline services `review` and `polish`.

## Services

Declare a system's graph with `### Services`:

```markdown
### Services

- `researcher`
- `writer`
```

Simple service names are Markdown list items. Structured `### Services` entries
use a fenced YAML list:

````markdown
### Services

```yaml
- name: reviewed-result
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 4
```
````

Use `with:` only for slot bindings. Use `config:` for pattern parameters.

## Structured Blocks

Use Markdown structure directly for Markdown: section headers, bullets, and
tables are the language surface and should not be wrapped in code fences.

Use fenced `yaml` only for structured YAML declarations such as pattern
instances in `### Services` or maps in `### Memory`. Use fenced `prose` only for
ProseScript in `### Execution` and pattern `### Delegation`. Do not use
`markdown` or `text` fences as structured data formats.

## How Systems Compose Work

Systems compose work in four ways:

1. **Plain services.** List service names in `### Services`; Forme wires them by matching `### Requires` to `### Ensures`.
2. **Subsystems.** List a `kind: system` file in `### Services`; Forme recursively wires it and treats the subsystem as one graph node.
3. **Explicit wiring.** Add `### Wiring` when a system must pin exact bindings between services.
4. **Pattern instances.** Use a fenced `yaml` declaration in `### Services` with `pattern:`, `with:`, and optional `config:`.

Canonical pattern instance shape inside a system's `### Services` section:

```yaml
- name: reviewed-draft
  pattern: std/patterns/worker-critic
  with:
    worker: writer
    critic: reviewer
  config:
    max_rounds: 3
```

`pattern:` names a `kind: pattern` file. `with:` binds slots to services,
subsystems, or nested pattern instances. `config:` sets pattern parameters.
After expansion, the named pattern instance behaves like a graph node in the
system.

Only `kind: system` files instantiate patterns directly. A `kind: service` does
work; it does not call a pattern. A `kind: test` names a service or system as
its subject; it does not test a pattern directly. Nested pattern declarations
are allowed only as slot values inside another pattern instance's `with:`
block.

## Runtime and Shape

Runtime hints and behavioral boundaries are also sections:

```markdown
### Runtime

- `persist`: project
- `model`: sonnet

### Shape

- `self`: evaluate sources, score confidence
- `delegates`:
  - `summarizer`: compression
- `prohibited`: direct web scraping
```

## Memory

A service with `persist: project` or `persist: user` in `### Runtime` reaches
into memory files that outlive the current run. The `### Memory` section
declares what that service *reads from* and *writes to* memory — the
persistent equivalent of `### Requires` / `### Ensures`:

````markdown
### Memory

```yaml
reads:
  - high_water_mark: ISO timestamp of the newest item processed in a prior run
  - cumulative_registry: map of id → { first_seen, last_seen, hit_count }
writes:
  - high_water_mark: advanced to the newest item observed this run
  - cumulative_registry: merged with items observed this run
  - last_run_at: ISO timestamp of this run's completion
```
````

Rules:

- `### Memory` is only meaningful when `### Runtime` sets `persist: project`
  or `persist: user`. A service with execution-scoped memory (`persist:
  true`) does not need this section — its memory dies with the run.
- `reads:` names fields the service expects to exist in memory; missing
  fields should be handled as "first run" rather than as errors.
- `writes:` names fields the service commits to update on a successful run.
  A failed run that does not reach the memory write leaves state untouched
  — see `guidance/authoring.md`, State and Memory Authoring.
- Fields that downstream responsibilities also need (high-water marks,
  cursors, run IDs) should *also* appear at the top level of `### Ensures`
  — see `guidance/authoring.md`, State and Memory Authoring. Memory is for
  the next invocation of *this* service; the return value is for the next
  responsibility.

See `prose.md` (Persistent Agents) and `state/filesystem.md` (Memory
Scoping) for the on-disk format of memory files.

## Frontmatter

Every service, system, test, or pattern declares identity with `name` and
`kind`:

```yaml
---
name: entry-name
kind: service | system | test | pattern
---
```

Frontmatter should stay structural. If a field would be useful to read, review,
or discuss, it should usually be a `###` section.

A `kind: test` file also declares `subject:` to name the service or system it
runs.

## Contract Item Style

Use backticked names followed by a colon:

```markdown
- `topic`: a research question
- `report`: executive-ready summary with sources
```

This is visually clear and easy for agents to extract.

`each` postconditions are contract items:

```markdown
- `articles`: collected articles from the feed
- each article has: a summary, relevance score, and key claims
```

## Typed Caller Inputs

Most `### Requires` entries are free-form values the caller provides at run
time. Two keywords are reserved for passing *completed runs* as inputs — the
typical shape for inspectors, regression checkers, and meta-systems:

```markdown
### Requires

- `subject`: run — a completed run to inspect
- `cohort`: run[] — a set of completed runs to compare
```

When an entry's type is `run` or `run[]`, the caller supplies a run ID (or a
list of them). The Prose VM resolves each ID to its run directory and writes a
structured binding at `bindings/caller/{name}.md` containing the run ID, path,
root source name, and status. The service reads that binding and then reaches into
the run's own `bindings/`, `vm.log.md`, and `manifest.run.md` directly.

See `prose.md` (Run-Typed Inputs) for binding format, resolution order (bare
ID, `~/{id}` for user scope, absolute path), and staleness validation.

## Execution Sections

`### Execution` contains ProseScript. Use a fenced block:

````markdown
### Execution

```prose
let research = call researcher
  topic: topic

return research
```
````

When `### Execution` is present, it is a Level 3 pin: Forme validates contracts
and extracts the call graph, but the Prose VM follows the written order.

## Tests

Test files use the same section grammar. A `kind: test` names a subject service
or system, supplies fixtures as caller inputs, then evaluates semantic
assertions against the subject's public bindings:

```markdown
---
name: test-summarizer
kind: test
subject: summarizer
---

### Fixtures

- `topic`: recent developments in quantum error correction

### Expects

- `summary`: contains at least five bullet points
- `summary`: is under 500 words

### Expects Not

- `summary`: contains fabricated citations
```

Rules:

- `subject:` must name a service or system. Tests do not execute patterns
  directly.
- Path-like subjects use normal service/system resolution. Bare subjects may
  resolve by matching frontmatter `name:` in the test file's directory and
  nearest OpenProse source/package root.
- `### Fixtures` must provide every caller input needed by the subject; tests do
  not prompt the user.
- `### Expects` and `### Expects Not` assert observable behavior, not exact
  phrasing.
- Test reports should list each assertion with pass/fail status and concise
  evidence for failures.

## Design Guidance

Use Contract Markdown when the author cares about the promise more than the
choreography. Use ProseScript when the author needs exact order, control flow,
or human-readable procedural steps.

For canonical service, system, pattern, test, memory, and security guidance,
load `guidance/authoring.md`.
