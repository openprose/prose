# 007 Runtime Profiles

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: introduce openprose runtime profiles`

## What Changed

- Added first-class `RuntimeProfile` records for the runtime axes OpenProse now treats separately:
  - `graph_vm`
  - `single_run_harness`
  - `model_provider`
  - `model`
  - `thinking`
  - `tools`
  - `persist_sessions`
- Added `src/runtime/profiles.ts` with profile parsing, environment hydration, defaults, and validation.
- Default runtime profiles to the persistent Pi graph VM with `read`/`write` tools.
- Rejected model providers and single-run harnesses when they are accidentally configured as the graph VM.
- Preserved single-run harness portability by recording harness-like provider objects as `single_run_harness` instead of letting them masquerade as graph VMs.
- Threaded runtime profiles into:
  - provider requests
  - run records
  - attempt records
  - trace events and trace views
  - remote execution envelopes
  - CLI run summaries
- Added package runtime `tools` metadata and regenerated package/hosted contract fixtures.

## Testing

- `bun run typecheck`
- `bun test test/runtime-profiles.test.ts test/provider-registry.test.ts test/scripted-pi-session.test.ts test/run-entrypoint.test.ts`
- `bun test`

Result: all local checks pass. Full suite: 186 pass, 2 skipped live-provider tests, 0 fail.

## Notable Learning

The old flat provider boundary was hiding two distinct truths:

- Reactive graph execution needs a stable graph VM identity.
- Single-run providers are still useful, but they are not the graph VM.

This slice now records both cleanly. A local-process or OpenAI-compatible provider object can still execute a single run in tests/examples, but its run record says the reactive graph VM model is Pi-shaped and the provider is a single-run harness detail.

## Next Slice

Phase 02.3 should replace the remaining `RuntimeProvider.execute(request)` graph execution boundary with a `ReactiveGraphRuntime.executeNode(request)` boundary. The Pi graph VM should become the place that creates one persisted Pi session per selected/stale graph node, while current/reused nodes should avoid session creation entirely.
