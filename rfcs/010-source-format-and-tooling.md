# RFC 010: Source Format and Tooling

**Status:** Draft
**Date:** 2026-04-23
**Author:** OpenProse design session

## Summary

OpenProse should keep Markdown as the primary human and agent authoring surface,
but stop relying on undifferentiated Markdown as the whole developer
experience. Canonical source files should use `.prose.md`, compile to IR, and
support syntax highlighting, formatting, linting, graph preview, source maps,
and run trace overlays.

## Canonical Source

Canonical Contract Markdown files use:

- `.prose.md` extension for executable source.
- Tiny YAML frontmatter for identity.
- `###` sections for contracts and policy.
- fenced `prose` blocks for execution.
- typed ports when public or published.
- explicit effects for every component.

Ordinary `.md` remains documentation unless explicitly compiled.

## Required Tooling

### Parser

Parses `.prose.md` into section AST and ProseScript AST.

### Compiler

Runs Forme and emits IR.

### Formatter

Normalizes section order, port item style, code fences, and frontmatter fields.

### Linter

Checks contracts, typed ports, effects, access policy, eval pairing, package
metadata, and source hygiene.

### Graph Preview

Renders:

- nodes
- ports
- edges
- effect badges
- access labels
- eval links
- stale/current run state when available

### Run Trace Overlay

Shows executed runs over the graph:

- success/failure/block status
- duration
- cost/budget
- model/harness
- inputs and outputs
- eval verdicts
- source locations

## Syntax Highlighting

Initial highlighting scopes:

- frontmatter keys
- component kind
- section headers
- port names
- port types
- service references
- effects
- access labels
- env var names
- ProseScript keywords
- call targets
- control flow
- return values

Tree-sitter is the preferred long-term parser/highlighter shape.

## Source Hygiene

Canonical files should avoid raw, unfenced execution bodies:

````markdown
### Execution

```prose
let result = call worker
  input: input

return result
```
````

Generated and migrated source should use this form.

## Validation

### Static Checks

- `.prose.md` files parse to AST and IR.
- Raw execution bodies fail canonical format lint.
- Section ordering is deterministic after formatting.
- Syntax highlighter identifies ports, types, effects, and calls.
- Graph preview reads IR only.

### Runtime Checks

- Clicking a graph node can resolve back to source line.
- Clicking a run trace event can resolve to graph node and source line.
- Formatting does not change semantic IR hash.

### Golden Fixtures

Create fixtures for:

- canonical single service
- canonical program with services
- program with execution fence
- access/effects section
- malformed port
- unfenced execution block
- graph preview JSON

### Agent Work Instructions

Agents should treat `.prose.md` as source and `.md` as documentation unless a
test intentionally covers migration. Do not add compatibility shims for every
historical spelling; migrate canonical examples instead.

### Done Criteria

- Canonical examples, std, and co compile as `.prose.md`.
- `prose fmt` produces stable source.
- `prose graph` makes a nontrivial program understandable without reading the
  whole Markdown file.
- Syntax highlighting exists for both Contract Markdown and ProseScript.

