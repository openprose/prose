# Implementation Note 009: Source-Quality Tooling

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 006, RFC 010

## Purpose

The ninth implementation wave starts the first source-oriented quality pass for
canonical `.prose.md` authoring.

This wave adds both sides of the feedback loop:

- `prose lint` to point out obvious source hygiene problems
- `prose fmt` to rewrite supported source into canonical order

## Scope

Added:

1. `prose lint <file>`.
2. `prose fmt <file>`.
3. lint checks for:
   - non-canonical `.prose.md` extension
   - duplicate sections
   - non-canonical section order
   - compiler-reported source hygiene issues such as raw execution bodies
4. formatter support for:
   - canonical frontmatter key ordering
   - canonical known-section ordering
   - fenced `### Execution` blocks
   - stable blank-line normalization
5. fixture tests for lint diagnostics, formatting behavior, and semantic-hash
   stability across formatting.

## Non-Goals

- No repo-wide migration yet.
- No `--check` mode yet.
- No full preservation of every historical Markdown quirk yet.
- No syntax-highlighting grammar yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose lint` surfaces obvious source-quality problems.
- `prose fmt` rewrites supported source into canonical order.
- formatting does not change semantic IR hashes.

## Progress Log

- 2026-04-23: Added `prose lint`, `prose fmt`, canonical section-order linting,
  duplicate-section detection, extension linting, execution fencing during
  formatting, and tests for both commands.

## Current Capabilities

- `prose lint` gives a fast source-quality pass before runtime.
- `prose fmt` rewrites supported canonical source deterministically.
- formatting preserves semantic IR identity on supported inputs.

## Next Slice

Syntax highlighting moved into Implementation Note 010.
