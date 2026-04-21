---
role: contract-markdown-format
summary: |
  Canonical Markdown format for OpenProse programs and services. Defines the
  header hierarchy, contract sections, compatibility with lowercase blocks,
  and how Forme should extract components from `.md` files.
see-also:
  - forme.md: Wiring semantics
  - prose.md: Execution semantics
  - prosescript.md: Imperative scripting layer for `### Execution`
  - guidance/tenets.md: Design reasoning
---

# Contract Markdown

Contract Markdown is the human-facing `.md` format for OpenProse programs,
services, tests, and composites. It uses tiny YAML frontmatter for file
identity, then Markdown sections for the human-facing language: services,
contracts, runtime hints, shape, and execution.

The format optimizes for two readers:

1. Humans scanning a workflow.
2. Agents extracting contracts and wiring components.

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
| `##` | Inline component boundary in multi-service files. |
| `###` | Section inside the current component. |
| `####`+ | Free-form nested documentation inside a section. |

`##` is reserved for inline component names so files can contain several
services without ambiguous parsing. Contract sections use `###` so they work
uniformly in standalone service files and inside inline components.

## Canonical Sections

Forme and the Prose VM recognize these `###` sections case-insensitively:

| Section | Applies To | Purpose |
|---------|------------|---------|
| `### Description` | program, service, test, composite | Human summary. Preserved for readers; not used as a contract |
| `### Services` | program | Components Forme should resolve and wire |
| `### Requires` | program, service, test, composite slots | Inputs or dependencies the caller/container must provide |
| `### Ensures` | program, service, composite | Outputs or postconditions the component commits to |
| `### Errors` | program, service | Declared failures the component may signal |
| `### Invariants` | program, service, composite | Properties that must hold regardless of outcome |
| `### Strategies` | program, service, test | Guidance for judgment calls and edge cases |
| `### Environment` | program, service | Runtime variables supplied by host infrastructure |
| `### Runtime` | program, service | Execution hints such as `persist` and `model` |
| `### Shape` | service | Capability boundaries: self, delegates, and prohibited work |
| `### Wiring` | program | Explicit Level 2 wiring declaration |
| `### Execution` | program, service | ProseScript choreography that pins execution |
| `### Fixtures` | test | Test inputs supplied without prompting |
| `### Expects` | test | Positive natural-language assertions |
| `### Expects Not` | test | Negative natural-language assertions |
| `### Slots` | composite | Services a composite requires from its caller |
| `### Config` | composite | Composite-level parameters and defaults |
| `### Delegation` | composite | ProseScript or pseudocode describing slot interaction |

Unknown `###` sections are preserved as documentation. They are not contract
sections unless a future spec names them.

## Compatibility Block Syntax

Older OpenProse files and generated drafts may use lowercase colon blocks for
contract sections:

```markdown
requires:
- topic: a question

ensures:
- report: an answer
```

Readers must continue accepting these blocks. When both forms appear for the
same section in the same component, the `###` section wins and the lowercase
block should produce a warning.

Canonical docs, examples, and generated migrations should use `###` headers.
The same rule applies to program topology and service behavior: use
`### Services`, `### Runtime`, and `### Shape` instead of large YAML values.

## Component Extraction

Forme parses a file in this order:

1. Read YAML frontmatter for identity metadata (`name`, `kind`) and compatibility fields.
2. Create the file-level component from the frontmatter.
3. Attach all `###` sections before the first `##` to the file-level component.
4. For every `## {name}` heading, create an inline component named `{name}`.
5. If the heading is immediately followed by a YAML block delimited by `---`,
   parse it as inline component frontmatter for compatibility. `name` must match
   the heading when present; `kind` defaults to `service`. Canonical files should
   prefer `### Runtime` and `### Shape` sections for behavior.
6. Attach subsequent `###` sections to that inline component until the next `##`.

Example:

````markdown
---
name: content-pipeline
kind: program
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

The file-level program requires `draft` and ensures `final`. It also
contains inline services `review` and `polish`.

## Services

Declare a program's component graph with `### Services`:

```markdown
### Services

- `researcher`
- `writer`
```

Simple service names are Markdown list items. Structured service declarations
use a fenced YAML list:

````markdown
### Services

```yaml
- name: reviewed-result
  compose: std/composites/worker-critic
  with:
    worker: writer
    critic: reviewer
    max_rounds: 4
```
````

`services:` in frontmatter remains accepted for compatibility, but canonical
OpenProse programs should use `### Services`.

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

The old `persist:`, `model:`, and `shape:` frontmatter fields remain accepted
for compatibility.

## Frontmatter

Every component should declare identity only:

```yaml
---
name: component-name
kind: program | service | test | composite
---
```

Frontmatter should stay structural. If a field would be useful to read, review,
or discuss, it should usually be a `###` section.

## Contract Item Style

Prefer backticked names followed by a colon:

```markdown
- `topic`: a research question
- `report`: executive-ready summary with sources
```

This is visually clear and easy for agents to extract. Plain names remain
accepted for compatibility:

```markdown
- topic: a research question
```

`each` postconditions are contract items:

```markdown
- `articles`: collected articles from the feed
- each article has: a summary, relevance score, and key claims
```

## Typed Caller Inputs

Most `### Requires` entries are free-form values the caller provides at run
time. Two keywords are reserved for passing *completed runs* as inputs — the
typical shape for inspectors, regression checkers, and meta-programs:

```markdown
### Requires

- `subject`: run — a completed run to inspect
- `cohort`: run[] — a set of completed runs to compare
```

When an entry's type is `run` or `run[]`, the caller supplies a run ID (or a
list of them). The Prose VM resolves each ID to its run directory and writes a
structured binding at `bindings/caller/{name}.md` containing the run ID, path,
program name, and status. The service reads that binding and then reaches into
the run's own `bindings/`, `state.md`, and `manifest.md` directly.

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

Readers should accept unfenced historical execution blocks, but generated files
should use a `prose` fence.

When `### Execution` is present, it is a Level 3 pin: Forme validates contracts
and extracts the call graph, but the Prose VM follows the written order.

## Tests

Test files use the same section grammar:

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

## Design Guidance

Use Contract Markdown when the author cares about the promise more than the
choreography. Use ProseScript when the author needs exact order, control flow,
or human-readable procedural steps.

Good Contract Markdown files:

- make every component's public interface obvious
- keep private reasoning out of contracts
- use `### Execution` only when auto-wiring is not enough
- reserve `##` for inline components, never contract sections
- use short, obligation-shaped section names: Requires, Ensures, Errors,
  Invariants, Strategies
