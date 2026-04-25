# 018: Pi SDK Spike

**Date:** 2026-04-25
**Phase:** Phase 04, sub-phase 04.4
**Commit:** same commit as this signpost

## What Changed

- Inspected the published Pi coding-agent SDK package.
- Confirmed the correct npm package is `@mariozechner/pi-coding-agent`.
- Inspected exported SDK types for session creation, session runtime, auth,
  model registry, settings, resource loading, tools, and event subscriptions.
- Ran a quarantined temp-directory smoke proving an in-memory Pi
  `AgentSession` can be created from TypeScript.
- Documented the alpha provider recommendation in
  `phases/04-provider-protocol/pi-sdk-spike.md`.

## How To Test

- `bun test`
- `bunx tsc --noEmit`
- Re-run the quarantined smoke command in
  `phases/04-provider-protocol/pi-sdk-spike.md` if the Pi package changes.

## Results

- Quarantined smoke created a Pi session and printed session metadata.
- `bunx tsc --noEmit` passed.
- `bun test` passed: 106 tests across 17 files.

## Next

- Phase 04.5: implement the Pi SDK alpha provider.

## Risks Or Open Questions

- Pi prompt execution requires model/auth configuration, so live integration
  tests must be opt-in.
- Pi returns conversation/session state, not typed OpenProse outputs. The alpha
  provider should enforce output files and validate them after prompt
  completion.
- The package dependency should remain provider-scoped so the OpenProse core
  protocol stays harness-agnostic.
