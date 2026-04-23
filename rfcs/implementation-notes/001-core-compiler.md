# Implementation Note 001: Core Compiler

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 006, RFC 007, RFC 008, RFC 010, RFC 011

## Purpose

The first implementation wave turns OpenProse from an agent-readable Markdown
skill into a machine-checkable language substrate.

The deliverable is a Bun-friendly `prose` binary that can compile canonical
`.prose.md` files into deterministic Prose IR.

This is intentionally before hosted runtime work and before full reactive
execution. IR is the narrow waist that every later system depends on:

- manifest projection
- local run materialization
- graph preview
- registry metadata
- reactive planning
- hosted run storage
- policy enforcement
- source maps and editor tooling

## First Slice

Build the smallest useful compiler:

1. Parse frontmatter and component sections from `.prose.md`.
2. Extract ports from `### Requires` and `### Ensures`.
3. Extract service declarations from `### Services`.
4. Extract `### Environment`, `### Effects`, and `### Access`.
5. Extract fenced `prose` execution blocks.
6. Emit deterministic IR JSON with source spans and diagnostics.
7. Emit a semantic IR hash that ignores formatting-only source changes.
8. Add golden fixtures and tests.

## Explicit Non-Goals

- No hosted backend changes in this slice.
- No full semantic auto-wiring yet.
- No scheduler or trigger source syntax.
- No compatibility matrix for every historical Markdown spelling.
- No VM execution or run materialization until the IR shape is testable.

## Validation

The first slice is on track when:

- `bun run test` passes in the OSS package.
- `bun run prose compile <fixture>` emits stable IR.
- whitespace-only fixture changes keep the same semantic hash.
- port/type/effect changes alter the semantic hash.
- malformed inputs produce diagnostics with source locations.

## Progress Log

- 2026-04-23: Implementation started with a Bun binary target and fixture-led
  compiler scope.
- 2026-04-23: Added `prose compile`, IR types, Contract Markdown parser, exact
  graph edges, semantic hash generation, source-located diagnostics, and the
  first compiler fixtures/tests.
- 2026-04-23: Added `prose manifest`, an IR-derived Markdown projection for the
  current VM-readable manifest shape.

## Current Capabilities

- `bun run prose compile <file.prose.md>` writes Prose IR JSON to stdout.
- `--out <path>` writes IR JSON to a file.
- Typed port syntax compiles for `### Requires` and `### Ensures`.
- `run`, `run[]`, and `run<T>` inputs are recognized as caller-provided run
  references during exact graph wiring.
- `### Environment`, `### Effects`, `### Access`, `### Services`, and fenced
  `### Execution` sections compile into IR.
- The first graph builder emits exact same-name edges, caller-input edges, and
  return edges.
- Diagnostics are emitted for malformed ports, raw execution bodies, pure effect
  exclusivity, unresolved inline service references, and unresolved exact
  dependencies.
- `bun run prose manifest <file.prose.md>` projects IR into a readable
  `manifest.md` without re-parsing source.

## Next Slice

Local run materialization moved into Implementation Note 002.
