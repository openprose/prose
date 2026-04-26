# 034 Producer Vocabulary

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: clarify producer and storage vocabulary`

## What Changed

- Renamed graph-wiring internals from provider/provider maps to
  producer/producer maps where the concept is "the component that produces a
  port."
- Updated compiler diagnostics and source IR tests to say "producer" for graph
  dependency resolution.
- Renamed node-runner test variables from `provider` to `runner` after the
  protocol rename.
- Renamed local artifact storage metadata from `provider: "local"` to
  `backend: "local"` so artifact storage is not confused with graph VMs,
  node runners, or model providers.
- Renamed live Pi smoke fallback failure classification from `provider_error`
  to `graph_vm_error`.
- Refreshed runtime confidence measurements after the vocabulary changes.

## Why It Matters

The remaining `provider` vocabulary was technically correct in a few places but
conceptually expensive. OpenProse now has clearer names at each layer:

- producer: graph component that produces an output port
- graph VM: Pi-shaped reactive graph execution substrate
- node runner: per-node execution adapter
- model provider: OpenRouter or another model provider inside the Pi profile
- artifact storage backend: local store or a future object store

This keeps the React-like graph model legible without weakening the model
provider concept.

## Tests Run

- `bun run typecheck`
- `bun test test/source-ir.test.ts test/package-ir.test.ts test/artifact-store.test.ts test/node-runner-protocol.test.ts test/node-runner-registry.test.ts test/pi-node-runner.test.ts test/runtime-control.test.ts test/run-entrypoint.test.ts test/run-attempts.test.ts test/runtime-profiles.test.ts test/live-pi-smoke.test.ts test/pi-events.test.ts`
- `bun test`
- `bun run confidence:runtime`
- `bun run smoke:binary`
- `git diff --check`

## Test Results

- Focused vocabulary/schema tests: 71 pass, 1 live Pi skip.
- Full suite: 230 pass, 1 live Pi skip, 0 fail.
- Runtime confidence matrix: pass, 18 checks.
- Bun binary smoke: pass.

## Tests Not Run

- Live Pi inference remained opt-in/skipped. This slice did not alter live Pi
  session behavior.

## Next Slice

- Re-scan the active package for remaining outdated RFC 013-era public wording
  that could mislead implementers, without rewriting historical signposts.
- Then continue into platform propagation planning once the OSS vocabulary is
  stable enough to treat as the canonical contract.

## Design Learnings

- "Provider" should now mean only model provider in the active runtime model.
- Producer terminology makes compiler and graph-planning code read like a
  dependency system instead of a harness registry.
- Artifact storage deserves its own vocabulary because the hosted platform will
  add object storage backends without changing graph execution semantics.
