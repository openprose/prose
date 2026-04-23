# Implementation Note 024: Local Preflight

**Started:** 2026-04-23
**Branch:** `rfc/reactive-openprose`
**Related RFCs:** RFC 003, RFC 010, RFC 011

## Purpose

The twenty-fourth implementation wave makes local readiness explicit before a
program is planned or run.

The key shift is from:

- "did I remember to install dependencies and set environment variables?"

to:

- "the CLI can tell me whether this program is locally ready without exposing
  secret values"

## Scope

Added:

1. `prose preflight <file.prose.md>`
2. transitive same-package service traversal from the target program
3. required environment-variable presence checks without printing values
4. pinned dependency install checks against `prose.lock` and `.deps/`
5. JSON and text renderers plus unit coverage for pass/fail cases

## Validation

This slice is on track when:

- `bun test` passes
- `bunx tsc --noEmit` passes
- `prose preflight <program>` reports `PASS` when env/deps are satisfied
- `prose preflight <program>` reports `FAIL` with missing items when they are not

## Progress Log

- 2026-04-23: added package-aware preflight traversal and readiness reporting
- 2026-04-23: wired `prose preflight` into the Bun CLI
- 2026-04-23: aligned README and `std/ops` docs with the implemented surface

## Observations

- environment declarations became much more valuable once they had a concrete
  local runtime check behind them
- `preflight` plus `status` makes the local CLI feel closer to a real runtime
  toolchain instead of just a compiler preview

## Next Slice

The next implementation slice should feed the new local runtime surfaces back
into the reference-company workflow: use `preflight` and `status` in the local
validation/docs story, then keep hardening the most visible reference-company
example components.
