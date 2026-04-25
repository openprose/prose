# Composite Expansion Slice

**Date:** 2026-04-25
**Phase:** 02.3 Make Composite Expansion Source-Mapped

Package IR now records composite service expansion as a first-class source-mapped
contract instead of leaving composition as unstructured service prose.

## Supported Shape

Level 1 composite shorthand in a `### Services` section is parsed as a composed
service:

```prose
- `reviewed-draft`: `worker-critic`
  - `worker`: `writer`
  - `critic`: `reviewer`
  - `max_rounds`: 2
```

This emits:

- a normal `ServiceIR` with `compose` and `with` bindings
- a `CompositeExpansionIR` on the parent component
- a package graph execution edge from `$compose` to the composite definition
- source spans for the service declaration and resolved composite definition

Package-local composite references resolve by the final path segment, so
`worker-critic`, `std/composites/worker-critic`, and registry-shaped references
can all resolve to a package component named `worker-critic`.

## Golden Fixtures

Focused fixtures for this slice live in:

- `fixtures/package-ir/composite-package/`
- `fixtures/composite-expansion/std-composed-reviewer.json`

The package IR summaries also now include expansion summaries so broad packages
catch composition contract drift:

- `fixtures/package-ir/examples.summary.json`
- `fixtures/package-ir/std.summary.json`
- `fixtures/package-ir/co.summary.json`

## Current Gaps

- Runtime execution does not yet execute composite control semantics. The
  meta-harness phase will turn expansion records into coordinated harness
  sessions.
- The current shorthand supports the common Level 1 service composition shape.
  Decorator-style syntax in `confident-writer` is still intentionally left as
  structured service text until the source model chooses one canonical syntax.
- Expansion input binding diagnostics are still shallow. Phase 06 should add
  schema-aware binding validation once the type and policy pass exists.
