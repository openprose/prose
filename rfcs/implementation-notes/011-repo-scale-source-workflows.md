# Implementation Note 011: Repo-Scale Source Workflows

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 010

## Purpose

The eleventh implementation wave turns the first source-quality commands into
real repo-scale workflows.

The key shift is from:

- "can this fix or report one file?"

to:

- "can this act like a believable local or CI workflow on a directory?"

## Scope

Added:

1. directory support for `prose lint`.
2. directory support for `prose fmt`.
3. `prose fmt --check`.
4. recursive source-file collection with ignored runtime/cache directories.
5. text and JSON summary output for repo-scale formatting and lint reports.
6. fixture tests for directory linting and formatting checks.

## Non-Goals

- No repo-wide migration yet.
- No package-aware policy thresholds yet.
- No auto-fix linting beyond the formatter.
- No pre-commit or CI config templates yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose fmt <dir> --check` reports files needing formatting and exits nonzero.
- `prose fmt <dir> --write` rewrites supported canonical files.
- `prose lint <dir>` aggregates diagnostics across source files.

## Progress Log

- 2026-04-23: Added recursive source discovery, directory support for lint and
  formatting, `fmt --check`, summary renderers, and coverage for repo-scale
  workflows.

## Current Capabilities

- source-quality tooling now works on directories, not only single files.
- `prose fmt --check` acts like a real formatting gate.
- `prose lint <dir>` gives per-file aggregated diagnostics.

## Next Slice

The next implementation slice should turn highlight tokens into a first real
rendered preview artifact, likely HTML, so the language becomes visually
distinct in a shareable surface rather than only in token dumps.
