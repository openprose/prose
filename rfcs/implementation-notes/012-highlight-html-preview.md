# Implementation Note 012: Highlight HTML Preview

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 010

## Purpose

The twelfth implementation wave turns highlight tokens into a shareable rendered
artifact.

The key shift is from:

- "can tooling see token scopes?"

to:

- "can people actually look at OpenProse source and feel that it is a language
  with structure?"

## Scope

Added:

1. HTML rendering for `prose highlight`.
2. CLI support for `prose highlight --format html`.
3. styled token rendering for contract fields and ProseScript control flow.
4. test coverage that checks token scopes survive the rendered preview.

## Non-Goals

- No editor extension yet.
- No Tree-sitter grammar yet.
- No interactive browser UI yet.
- No graph/trace overlay inside the source preview yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose highlight <file> --format html` emits a complete HTML document.
- rendered HTML preserves key token scopes like frontmatter, ports, effects,
  and call targets.

## Progress Log

- 2026-04-23: Added a standalone HTML preview surface for highlight tokens and
  exposed it through the Bun CLI.

## Current Capabilities

- highlight output now has three useful shapes: text, JSON, and HTML.
- OpenProse source can be rendered as a visually distinct language artifact
  without needing an editor extension first.

## Next Slice

The next implementation slice should package the highlight model into an editor
artifact, most likely a TextMate grammar, so `.prose.md` files look native in
real authoring environments instead of only in generated previews.
