# Implementation Note 023: Local Run Status

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 005, RFC 010

## Purpose

The twenty-third implementation wave makes local run directories easier to
scan as a set.

The key shift is from:

- "you can inspect one run if you already know where it is"

to:

- "you can quickly see what materialized recently, whether it succeeded, and
  where the artifacts live"

## Scope

Added:

1. `prose status [run-root]`
2. JSON and text renderers for recent local run materializations
3. run ordering by creation time
4. output and node-count summaries for each run entry
5. test coverage for status summaries over multiple run directories

## Validation

This slice is on track when:

- `bun test` passes
- `bunx tsc --noEmit` passes
- `prose status <run-root>` lists recent runs in newest-first order
- text output shows run id, component, status, outputs, and run path

## Progress Log

- 2026-04-23: added `statusPath()` and text/JSON renderers for local run roots
- 2026-04-23: wired `prose status` into the Bun CLI
- 2026-04-23: aligned `std/ops` docs with the new local status surface

## Observations

- `trace` is the right deep view for one run; `status` is the right shallow
  view for many runs
- a local-first runtime feels much more real once there is a quick answer to
  "what just ran?"

## Next Slice

The next implementation slice should add a local preflight surface for
dependency/env readiness, then use it to tighten the reference-company local
workflow without stepping into hosted execution yet.
