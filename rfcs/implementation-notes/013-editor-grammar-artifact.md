# Implementation Note 013: Editor Grammar Artifact

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 010

## Purpose

The thirteenth implementation wave packages OpenProse highlighting into a real
editor-facing artifact.

The key shift is from:

- "can we render source nicely ourselves?"

to:

- "can other tooling consume a stable grammar without re-deriving the
  language?"

## Scope

Added:

1. `prose grammar` to emit a TextMate grammar artifact.
2. a generated `syntaxes/openprose.tmLanguage.json` file in the OSS package.
3. test coverage that keeps the checked-in grammar synchronized with the
   generator.
4. README examples for generating editor syntax assets.

## Non-Goals

- No full VS Code extension yet.
- No Tree-sitter parser yet.
- No syntax theme package yet.
- No live editor integration in hosted product surfaces yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose grammar` emits valid JSON.
- the checked-in TextMate grammar artifact matches generator output.

## Progress Log

- 2026-04-23: Added TextMate grammar generation and a checked-in syntax
  artifact for `.prose.md` authoring.

## Current Capabilities

- OpenProse now ships an editor-facing grammar artifact instead of only runtime
  and preview surfaces.
- syntax highlighting can be consumed by tooling without reverse-engineering
  the language from rendered HTML or token dumps.

## Next Slice

The next implementation slice should move from source ergonomics into package
discovery by generating registry/package metadata directly from canonical IR.
