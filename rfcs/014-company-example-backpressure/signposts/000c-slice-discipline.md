# 000c: Slice Discipline

**Date:** 2026-04-26
**Branch:** `rfc/reactive-openprose`
**Slice:** Planning discipline before implementation
**Commit:** This documentation slice.

## What Changed

- Strengthened the RFC 014 phase README with a per-slice checklist.
- Added a signpost template.
- Made test/signpost/commit/push expectations explicit for code and
  documentation slices.

## Why It Matters

The Pi runtime rewrite will include deletion-heavy slices where old tests may
move before new tests land. The planning tree now requires every slice to say
what was tested, what was not tested, and how coverage is restored.

## Tests Run

- `git diff --check`
- trailing-whitespace scan over RFC 014 docs

## Tests Not Run

- Full runtime tests were not run because this is documentation-only.

## Next Slice

- Start `02.1A Remove public provider entrypoints`.

## Design Learnings

- Implementation discipline needs to be part of the artifact, not remembered
  socially. The runtime work is tricky enough that the breadcrumbs have to be
  boring and reliable.
