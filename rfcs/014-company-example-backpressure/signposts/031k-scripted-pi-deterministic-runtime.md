# 031k Scripted Pi Deterministic Runtime

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: route deterministic output through scripted pi`

## What Changed

- Removed the public `fixture` graph runtime/provider implementation.
- Added an internal scripted Pi runtime under `src/runtime/pi/scripted.ts` for
  deterministic local `--output` runs and tests.
- Routed CLI deterministic outputs, remote hosted envelopes, runtime profiles,
  and provider resolution through graph VM `pi` with model provider `scripted`
  and model `deterministic-output`.
- Regenerated hosted runtime fixtures so their run records, artifacts, and
  envelopes now report the same Pi-shaped runtime profile as the real graph VM.
- Refactored scripted-Pi test support to reuse the production internal helper
  instead of carrying a second local fake runtime.
- Made Pi session file refs relative to the workspace when possible so hosted
  fixtures and traces stay portable.
- Refreshed measurement reports so deterministic confidence runs no longer
  advertise `fixture`.

## Why It Matters

This removes the last major wart from the Phase 02 runtime boundary. Authors
now see one graph VM story: reactive graph execution is Pi-shaped, while
deterministic local tests are implemented as internal scripted Pi sessions.
That keeps examples, hosted envelopes, traces, and tests aligned with the
North Star instead of preserving an old fake provider as a public concept.

## Tests Run

- `bun test test/runtime-profiles.test.ts test/provider-registry.test.ts test/run-entrypoint.test.ts test/runtime-materialization.test.ts test/provider-protocol.test.ts test/scripted-pi-session.test.ts`
- `bun test test/hosted-contract-fixtures.test.ts test/run-entrypoint.test.ts`
- `bun run typecheck`
- `bun test`
- `bun run confidence:runtime`

## Test Results

- Focused runtime/provider tests: 57 pass.
- Hosted fixture + run entrypoint tests: 23 pass.
- Full suite: 238 pass, 2 skip, 0 fail.
- Runtime confidence matrix: pass, 18 checks.

## Tests Not Run

- Live Pi inference smoke stayed skipped by default. The confidence matrix still
  exercises the skip path and writes an inspectable report, but this slice was
  about removing public fixture semantics rather than spending live model
  budget.

## Next Slice

- Continue from the Phase 07.3 question: either promote semantic golden
  snapshots for a small customer-example set, or first do one more runtime
  naming pass now that deterministic outputs have been pulled behind scripted
  Pi.

## Design Learnings

- Determinism is still valuable, but it belongs inside the same runtime shape
  as real execution. A fake top-level provider taught the wrong abstraction.
- Hosted contract fixtures are a useful backpressure point because they catch
  stale runtime vocabulary in JSON envelopes, artifact manifests, traces, and
  measurement reports.
- The scripted helper should live in source, not only under `test/support`,
  because public CLI deterministic runs and hosted envelope smoke tests need
  the same controlled Pi-shaped behavior.
