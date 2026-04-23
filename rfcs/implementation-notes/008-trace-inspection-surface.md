# Implementation Note 008: Trace Inspection Surface

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 009, RFC 010

## Purpose

The eighth implementation wave adds a lightweight `prose trace` surface over
local run materializations.

This is the first pass at making run state readable without opening
`run.json`, `nodes/*.run.json`, and `trace.json` separately.

## Scope

Added:

1. `prose trace <run-dir|run.json>`.
2. text output by default for human-readable run summaries.
3. JSON trace output through `--format json`.
4. trace loading for:
   - graph runs
   - single-component runs
   - node-level run records
   - `trace.json` events
5. fixture tests for trace JSON loading and text rendering.

## Non-Goals

- No hosted trace API yet.
- No timeline UI yet.
- No cost/budget accounting yet.
- No graph overlay merge yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `prose trace` can summarize a graph run directory.
- `prose trace` can summarize a single-component materialization.
- trace output includes node statuses and recorded events.

## Progress Log

- 2026-04-23: Added `prose trace`, text/JSON outputs, local run-directory
  loading, event loading from `trace.json`, and coverage for graph and
  component runs.

## Current Capabilities

- `prose trace` gives a readable summary of a materialized run.
- graph runs include node-level statuses and outputs.
- the first event stream is loaded from local `trace.json`.
- JSON output can feed future graph/trace overlay tooling.

## Next Slice

The next implementation slice should start the first source-oriented quality
tooling pass: a formatter or linter that normalizes canonical `.prose.md`
authoring and catches obvious source hygiene violations before runtime.
