# Implementation Note 005: Plan Freshness and Dependency Comparison

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 006, RFC 008, RFC 009

## Purpose

The fifth implementation wave teaches `prose plan` about two invalidation
inputs that are central to honest reactive execution:

- freshness windows for refreshable reads
- dependency package SHA changes from pinned package state

Without these, the planner can compare source and inputs, but it still cannot
answer "is this run current?" in the way RFC 009 actually intends.

## Scope

Added:

1. `### Runtime` parsing into canonical IR.
2. effect config parsing for values like `freshness 6h`.
3. package dependency pin resolution from the nearest `prose.lock`.
4. run-record dependency materialization in local runs.
5. planner stale reasons:
   - `freshness_expired:<duration>`
   - `dependency_sha_changed:<package>`
6. planner/runtime policy refinement so `read_external` is refreshable rather
   than always treated as an unsafe side effect.
7. fixture tests for freshness expiry and dependency-pin invalidation.

## Non-Goals

- No requested-output recompute minimization yet.
- No schema-change invalidation yet.
- No eval-policy invalidation yet.
- No hosted budgets or tenant backpressure integration yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- `### Runtime` freshness compiles into IR.
- a run older than its freshness window plans as stale.
- changing a pinned dependency SHA plans the affected run as stale.
- `read_external` can refresh instead of being treated like a duplicate
  delivery or mutation.

## Progress Log

- 2026-04-23: Added runtime parsing, effect freshness parsing, lockfile-backed
  dependency pin resolution, dependency materialization in local run records,
  freshness expiry invalidation, dependency-SHA invalidation, and coverage for
  both planner paths.

## Current Capabilities

- `prose compile` now emits runtime settings and package dependency pins in IR.
- `prose materialize` records pinned package dependencies in `run.json`.
- `prose plan` can invalidate a previously current run because its freshness
  window expired.
- `prose plan` can invalidate a previously current run because a pinned package
  SHA changed.
- `read_external` now behaves like a refreshable read in local planning instead
  of being blocked as an unsafe mutation.

## Next Slice

Exact recompute preview moved into Implementation Note 006.
