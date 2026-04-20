---
purpose: The OpenProse skill: Contract Markdown, ProseScript, Forme wiring, VM execution, dependency resolution, examples, state backends, and primitives.
related:
  - ../README.md
  - ./contract-markdown.md
  - ./prosescript.md
  - ./examples/README.md
  - ./guidance/README.md
  - ./state/README.md
  - ./primitives/README.md
glossary:
  Contract Markdown: The `.md` program format with tiny identity frontmatter and `###` contract sections.
  ProseScript: The imperative scripting layer used in `.prose` files and `### Execution` blocks.
  Forme: The semantic dependency-injection container described by `forme.md`.
  Prose VM: The execution engine described by `prose.md`.
  Prose Complete: An LLM and harness that can read these specs, spawn subagents, access files, and execute tool calls.
---

# open-prose

The OpenProse skill turns an AI session into a portable multi-agent runtime.
It activates on `prose` commands, Contract Markdown programs, ProseScript
programs, and requests to orchestrate reusable agent workflows.

## Contents

| File or Directory | Purpose |
|-------------------|---------|
| `SKILL.md` | Activation rules and command routing |
| `contract-markdown.md` | Canonical `.md` program format and header hierarchy |
| `prosescript.md` | Imperative syntax for `.prose` files and `### Execution` |
| `forme.md` | Forme container: contract extraction, auto-wiring, manifest generation |
| `prose.md` | Prose VM: manifest execution, service spawning, state handling |
| `deps.md` | Git-native dependency resolution and `prose install` |
| `help.md` | User-facing help output |
| `state/` | State backend specifications |
| `primitives/` | Primitive operation guidance, especially service sessions |
| `guidance/` | Tenets, patterns, antipatterns, and dedicated runtime prompt text |
| `examples/` | Contract Markdown examples from simple services to production workflows |
| `v0/` | Historical references for the original ProseScript-era syntax |

## Layers

OpenProse is easiest to reason about as four layers:

1. **Contract Markdown** declares components and promises.
2. **Forme** wires those promises into an executable manifest.
3. **Prose VM** walks the manifest, spawns services, and manages state.
4. **ProseScript** pins choreography when declarations are not enough.

The default path is declarative: write contracts, let Forme wire them, and let
the VM execute. The explicit path is scripted: write ProseScript in a `.prose`
file or `### Execution` block to control order, loops, branches, and retries.

## Directory Relationships

The spec layer defines runtime behavior:

- `contract-markdown.md`
- `prosescript.md`
- `forme.md`
- `prose.md`
- `state/`
- `primitives/`

The operational layer teaches usage and evolution:

- `examples/`
- `guidance/`

Shared library programs live in the external `openprose/std` repository and are
resolved through `deps.md`.

The compatibility layer preserves older details:

- `v0/`

## Current Format

Canonical Contract Markdown uses `###` section headers:

```markdown
### Requires

- `topic`: a research question

### Ensures

- `report`: executive-ready answer with sources

### Strategies

- when sources are thin: broaden search terms
```

Lowercase compatibility blocks (`requires:`, `ensures:`, and friends) remain accepted
for compatibility, but new examples and generated files should use the header
form.
