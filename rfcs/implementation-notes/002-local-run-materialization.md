# Implementation Note 002: Local Run Materialization

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 006, RFC 008, RFC 009

## Purpose

The second implementation wave makes RFC 005 concrete locally. The compiler can
now emit IR and manifest projections; the next step is to write immutable run
records from those artifacts.

This slice deliberately does not pretend to execute agent work. Instead it adds
an honest local materializer:

- caller inputs are supplied explicitly
- fixture outputs are supplied explicitly
- pure components can materialize as succeeded runs
- missing required data produces blocked runs
- side-effecting components are blocked by default

This gives backend agents a real run-record shape to target before hosted
execution exists.

## First Slice

Add:

1. `prose materialize <file.prose.md>`.
2. RFC 005-style `run.json` records.
3. `ir.json` and `manifest.md` in the run directory.
4. `bindings/caller/*` input artifacts.
5. `bindings/{component}/*` output artifacts.
6. node-level run records for program service graphs.
7. fixture tests for succeeded pure materialization and blocked runs.

## Non-Goals

- No subagent spawning.
- No hosted storage.
- No reactive planner.
- No eval execution.
- No side-effect execution.

## Validation

This slice is on track when:

- `bun run test` passes.
- a pure single-service fixture can write a succeeded `run.json`.
- a pure graph fixture can write graph-level and node-level records.
- missing required outputs produce a blocked run.
- non-pure effects are blocked without producing fake external work.

## Progress Log

- 2026-04-23: Local run materialization slice started.
- 2026-04-23: Added `prose materialize`, RFC 005 run records, run directories,
  caller input artifacts, fixture output artifacts, manifest/IR writes, graph
  node run records, and blocked-run behavior for missing outputs and unsafe
  effects.

## Current Capabilities

- `bun run prose materialize <file.prose.md>` writes `.prose/runs/{run-id}` by
  default.
- `--run-root <path>` chooses a different run root.
- `--run-id <id>` pins the run id for tests and reproducible fixtures.
- `--input name=value` supplies caller inputs.
- `--output port=value` supplies a single-service or graph return fixture.
- `--output component.port=value` supplies service-node fixture outputs.
- Pure components and pure graphs can materialize as `succeeded`.
- Missing fixture outputs produce `blocked` run records.
- Components or graphs with non-pure effects are blocked by default.

## Next Slice

The next implementation slice should introduce the first planner surface:
`prose plan`. It should read IR plus optional prior run records and explain
ready, blocked, stale, and skipped nodes without executing or materializing new
runs.
