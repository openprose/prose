# Module Boundary Scaffold

**Date:** 2026-04-25
**Phase:** 01.3 Define Public Module Boundaries

This scaffold gives the ideal package its future module addresses before large
logic moves begin. The current implementation still lives mostly in flat
`src/*.ts` files; these directories are the migration targets.

## Public Entry Point

`src/index.ts` now exports module namespaces rather than a long list of
incidental implementation functions:

- `core`
- `source`
- `ir`
- `schema`
- `graph`
- `meta`
- `store`
- `runtime`
- `providers`
- `policy`
- `evals`
- `packageLifecycle`
- `runCli`

The namespace names are deliberately architectural. `evals` and
`packageLifecycle` avoid JavaScript reserved-word awkwardness while preserving
the intended RFC module families.

## Boundary Map

| Boundary | Current exports | Future responsibility |
| --- | --- | --- |
| `core` | hashes, text normalization, diagnostics/spans/status types | shared primitives, serialization, diagnostics, hashes |
| `source` | Markdown parser, section parser, formatter, linter, highlighter, grammar, file collection | source parsing, source maps, formatting, linting, editor tooling |
| `ir` | `compileFile`, `compileSource`, manifest projection, IR types | canonical package IR builder, normalizer, semantic hash projection |
| `schema` | type metadata placeholders | schema IR, schema resolution, JSON Schema projection, validation |
| `graph` | graph view builder and Mermaid renderer | deterministic graph normalization and graph views |
| `meta` | empty scaffold | intelligent proposal records and accepted meta-operation inputs |
| `store` | status/trace views and run record types | local run/artifact/graph-node store, indexes, migrations |
| `runtime` | current planner, fixture materializer, remote envelope | planner, executor, meta-harness, run lifecycle |
| `providers` | empty scaffold | fixture, local process, Pi, and optional harness adapters |
| `policy` | access/effect/run binding types | effects, approvals, labels, declassification, idempotency, budgets |
| `eval` | eval run record type | eval discovery, execution, scoring, and acceptance gates |
| `package` | install, lockfile, registry refs, metadata, publish, search | package metadata, dependency resolution, registry refs, lockfiles |
| `cli` | `runCli` | thin command layer over library APIs |

## Temporary Locations

These files remain flat until their owning phases move logic behind the new
boundaries:

- `compiler.ts`
- `materialize.ts`
- `plan.ts`
- `remote.ts`
- `types.ts`
- `package.ts`
- `publish.ts`
- `install.ts`
- `search.ts`
- source tooling files

The scaffold is intentionally light. It gives imports a stable destination
without pretending the architecture is already complete.
