# 006: Structured Execution IR

**Date:** 2026-04-25
**Phase:** Phase 02, sub-phase 02.2
**Commit:** same commit as this signpost

## What Changed

- Added structured execution step types to `ExecutionIR`.
- Parsed fenced `prose` execution blocks into call, parallel, condition, loop,
  try, return, and text fallback steps.
- Added diagnostics for execution lines or bindings that cannot yet be parsed.
- Added focused execution IR fixtures and goldens.
- Added tests for simple call/return, parallel calls, condition/loop/try/return,
  and unsupported execution text.
- Documented supported constructs and gaps in
  `phases/02-ir-and-source-model/execution-ir.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- `bun bin/prose.ts compile examples/company-intake.prose.md`

## Results

- `bun test` passed: 79 tests across 8 files.
- `bunx tsc --noEmit` passed.
- `bun bin/prose.ts compile examples/company-intake.prose.md` passed.

## Next

- Phase 02.3: make composite expansion source-mapped and executable in package
  IR.

## Risks Or Open Questions

- Structured execution is now represented, but runtime execution still uses the
  older planner/materializer path. The meta-harness phase will make these steps
  operational.
