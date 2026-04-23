# Implementation Note 007: Graph Inspection Surface

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 006, RFC 009, RFC 010

## Purpose

The seventh implementation wave adds the first real graph inspection surface:
`prose graph`.

This is the first step toward making a nontrivial OpenProse program
understandable without reading the whole source file or raw plan JSON.

## Scope

Added:

1. `prose graph <file.prose.md>`.
2. Mermaid output by default for human-readable graph previews.
3. JSON graph output through `--format json`.
4. optional plan overlay through the same planner inputs:
   - `--current-run`
   - `--target-output`
   - `--input`
5. graph nodes that show kind, status, effects, selected materialization, and
   source location.
6. graph edges that preserve ports and edge kinds from IR.
7. fixture tests for graph preview JSON and Mermaid rendering.

## Non-Goals

- No graphical UI yet.
- No clickable source-line integration yet.
- No trace overlay yet.
- No layout optimization beyond Mermaid flow output yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose graph` can render a nontrivial program without reading Markdown.
- graph JSON includes nodes, edges, and requested outputs.
- Mermaid output reflects selected vs skipped work under targeted planning.

## Progress Log

- 2026-04-23: Added `prose graph`, JSON and Mermaid graph output, plan overlay,
  and tests for graph structure and status rendering.

## Current Capabilities

- `prose graph` renders IR-native graph previews.
- targeted planning overlays show `ready`, `current`, `blocked_*`, and
  `skipped` node states directly in the graph.
- Mermaid output includes caller/return boundaries and source locations.
- JSON output can serve as a fixture and future UI substrate.

## Next Slice

Trace inspection moved into Implementation Note 008.
