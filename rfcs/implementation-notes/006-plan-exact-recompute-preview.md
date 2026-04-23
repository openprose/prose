# Implementation Note 006: Plan Exact Recompute Preview

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 009, RFC 010

## Purpose

The sixth implementation wave turns `prose plan` from a stale/current classifier
into an exact recompute preview.

The planner now answers a more useful question:

> For the output I actually care about, which nodes would rerun right now?

That is the first step toward replacing "a wall of commands" with something a
human can reason about.

## Scope

Added:

1. `--target-output <port>` support for `prose plan`.
2. output-aware node selection from requested program outputs.
3. `skipped` node status for stale-but-unneeded work.
4. exact `materialization_set` output in the plan JSON.
5. output-scoped graph status so a stale sibling branch does not force the
   whole plan out of `current` when it is irrelevant to the requested output.
6. fixture tests for skipped stale branches and exact materialization sets.

## Non-Goals

- No actual recompute execution yet.
- No graph UI yet.
- No trace overlay yet.
- No hosted backpressure or queue orchestration yet.

## Validation

This slice is on track when:

- `bun test` passes.
- `bunx tsc --noEmit` passes.
- planning a narrow target output can return `current` even when an unrelated
  sibling branch is stale.
- stale-but-unneeded nodes plan as `skipped`.
- `materialization_set` lists only the nodes that would actually rerun.
- targeted plans do not claim they would materialize a new graph run unless the
  full graph output set was requested.

## Progress Log

- 2026-04-23: Added output-targeted planning, `skipped` nodes, exact
  materialization sets, and targeted planner coverage for selective recompute.

## Current Capabilities

- `prose plan --target-output <port>` scopes planning to the requested output.
- stale nodes outside the requested dependency closure are marked `skipped`.
- the plan JSON includes `requested_outputs` and `materialization_set`.
- `current` now means "current for the thing you asked for," not only "nothing
  anywhere in the graph is stale."

## Next Slice

The next implementation slice should add source-level graph and trace inspection
surfaces on top of the IR and plan output, so users can see the structure and
the stale/current reasons without reading raw JSON.
