# Implementation Note 010: Syntax-Highlighting Surface

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 006, RFC 010

## Purpose

The tenth implementation wave adds the first syntax-highlighting surface for
OpenProse source.

This is not the final editor grammar, but it makes the language token-visible:
ports, types, effects, access labels, and ProseScript control flow can now be
identified programmatically and surfaced in tooling.

## Scope

Added:

1. `prose highlight <file>`.
2. text output by default for quick inspection.
3. JSON token output through `--format json`.
4. first-pass token scopes for:
   - frontmatter keys
   - component kind
   - section headers
   - port names
   - port types
   - service references
   - effect kinds
   - access keys and labels
   - env var names
   - ProseScript keywords
   - call targets
   - return values
5. fixture tests for token coverage and text rendering.

## Non-Goals

- No Tree-sitter grammar yet.
- No editor integration yet.
- No semantic coloring by graph/run status yet.
- No markdown-doc highlighting outside canonical source constructs yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose highlight` emits port/type/effect/call tokens for canonical fixtures.
- text output makes the language visibly different from plain Markdown.

## Progress Log

- 2026-04-23: Added `prose highlight`, text/JSON token outputs, first-pass
  highlight scopes, and tests covering source-token visibility.

## Current Capabilities

- canonical source can now be tokenized for tooling.
- ProseScript control-flow tokens are surfaced alongside contract tokens.
- JSON output can seed future editor and web highlighting work.

## Next Slice

The next implementation slice should likely move from CLI tooling into a first
editor/web integration artifact, or deepen the formatter/linter with repo-scale
canonicalization and `--check` support.
