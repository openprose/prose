# 006 Scripted Pi Tests

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `test: replace fixture provider with scripted pi sessions`

## What Changed

- Added `test/support/scripted-pi-session.ts`, a deterministic Pi-shaped runtime helper.
- Added `test/support/runtime-scenarios.ts` for shared graph output scenarios.
- Added focused coverage for scripted Pi success, missing outputs, model errors, and timeouts.
- Migrated the core programmatic runtime tests from `provider: "fixture"` to scripted Pi sessions:
  - `run-entrypoint`
  - `runtime-control`
  - executable evals
  - std roles/evals/patterns
  - co package smoke
- Kept the remaining fixture references limited to the explicit fixture provider/materializer, hosted envelope, provider protocol, provider registry, and CLI deterministic-output compatibility tests.

## Testing

- `bun run typecheck`
- `bun test`

Result: all local checks pass. Full suite: 181 pass, 2 skipped live-provider tests, 0 fail.

## Notable Learning

Scripted Pi writes outputs into the node workspace the way the current Pi adapter does, so programmatic runtime tests now assert Pi-style artifact refs such as `message.md` instead of fixture-materializer binding paths. This is the correct pressure for Phase 02 because it makes the test suite care about the actual graph VM contract.

## Next Slice

Phase 02.2 should introduce first-class runtime profiles in source/package/run records. The code still has a flat `provider` field through `RunOptions`, `ProviderRequest`, trace events, and remote envelopes. The next slice should separate graph VM, single-run harness, model provider, model, thinking level, tools, and session persistence without expanding feature scope.
