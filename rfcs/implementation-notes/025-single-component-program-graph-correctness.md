# Implementation Note 025: Single-Component Program Graph Correctness

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 009, RFC 010

## Purpose

The twenty-fifth implementation wave fixes a subtle but important runtime edge
case: programs with no inline service graph should still behave like valid
program graphs.

This was surfaced immediately by the reference-company validation path when
`company.prose.md` was materialized locally.

## Scope

Added:

1. caller edges for single-component program inputs
2. return edges for single-component program outputs
3. optional-input handling in the local planner and materializer
4. regression tests for single-component program graph edges and
   materialization

## Validation

This slice is on track when:

- `bun test` passes
- `bunx tsc --noEmit` passes
- a single-component program plans as `ready`, not `blocked_input`, when only
  optional inputs are absent
- a single-component program can materialize a succeeded run from direct output
  bindings

## Progress Log

- 2026-04-23: added self caller/return graph edges for single-component
  programs
- 2026-04-23: stopped treating optional inputs as required in local planning
  and materialization

## Observations

- the reference company is doing exactly the right job: it is flushing out
  runtime assumptions that fixture-only work would have missed
- local graph correctness matters even before hosted execution exists, because
  graph/plan/materialize/status all sit on the same substrate

## Next Slice

The next implementation slice should keep improving the reference-company
surface: checkpoint the validation/docs updates, then harden the most visible
root-package example workflows and responsibilities.
