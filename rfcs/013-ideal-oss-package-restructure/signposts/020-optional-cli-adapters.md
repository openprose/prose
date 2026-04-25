# 020: Optional CLI Adapters Deferred

**Date:** 2026-04-25
**Phase:** Phase 04, sub-phase 04.6
**Commit:** same commit as this signpost

## What Changed

- Evaluated local availability of Codex CLI, Claude Code, OpenCode, and Pi.
- Confirmed all have some non-interactive or headless mode.
- Decided not to add dedicated CLI adapters before the meta-harness.
- Documented future adapter acceptance criteria in
  `phases/04-provider-protocol/optional-cli-adapters.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`

## Results

- CLI availability was inspected locally.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 110 tests, 1 skipped live smoke across 18 files.

## Next

- Phase 05: build the meta-harness and reactive execution loop over the provider
  protocol.

## Risks Or Open Questions

- CLI adapters may still be useful after Phase 05, especially for users who
  already have Codex CLI, Claude Code, or OpenCode configured locally.
- The correct future shape is probably a shared `AgentProcessProvider`, not
  three separate bespoke implementations.
