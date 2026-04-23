# Implementation Note 003: Plan Preview

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 008, RFC 009

## Purpose

The third implementation wave introduces the first reactive planner surface:
`prose plan`.

The planner should explain what would run, what would block, and why before the
runtime materializes runs or performs hosted execution. This is the debugging
surface RFC 009 calls for.

## First Slice

Add:

1. `prose plan <file.prose.md>`.
2. JSON plan output with per-node status.
3. `ready`, `blocked_input`, and `blocked_effect` classifications.
4. `no_current_run` stale reasons for first-run plans.
5. graph-level blocked reasons for program effects.
6. fixture tests for ready graphs, missing inputs, and unsafe effects.

## Non-Goals

- No prior-run invalidation yet.
- No freshness windows yet.
- No eval acceptance yet.
- No recompute execution.
- No hosted backpressure integration.

## Validation

This slice is on track when:

- `bun run test` passes.
- a pure graph with supplied caller inputs is planned as ready.
- a graph missing caller inputs is planned as blocked.
- a graph with non-pure effects reports blocked effect reasons.

## Progress Log

- 2026-04-23: Plan preview slice started.
- 2026-04-23: Added `prose plan`, JSON plan output, ready/blocked node
  classifications, first-run stale reasons, missing-input blocking, and
  graph-level side-effect blocking.

## Current Capabilities

- `bun run prose plan <file.prose.md>` emits plan JSON.
- `--input name=value` supplies caller inputs for readiness checks.
- Pure graph nodes with satisfiable inputs plan as `ready`.
- Missing caller inputs plan as `blocked_input`.
- Non-pure graph effects plan as blocked graph reasons.
- First-run nodes include `stale_reasons: ["no_current_run"]`.

## Next Slice

The next implementation slice should let `prose plan` compare against existing
run records. It should classify nodes as current versus stale when source,
input hashes, IR hashes, dependency hashes, or effect declarations change.
