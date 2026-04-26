# 033 Node Runner Vocabulary

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: rename runtime provider layer to node runners`

## What Changed

- Renamed the internal runtime execution layer from `providers` to
  `node-runners`.
- Replaced the flat programmatic `provider` option with explicit
  `graphVm` and `nodeRunner` inputs.
- Renamed runtime protocol shapes from provider requests/results/session refs
  to node-run requests/results/session refs.
- Changed node session and telemetry payloads to record `graph_vm` instead of
  `provider`.
- Updated traces from `provider.session`, `provider.cost`, and
  `provider.failure` to `node_session.started`, `node_run.cost`, and
  `node_run.failure`.
- Updated hosted runtime fixtures and remote envelopes to expose `graph_vm`.
- Refreshed measurement and runtime-confidence output after the vocabulary
  change.

## Why It Matters

This removes the last major internal ambiguity that made OpenProse look like a
flat provider runner. The package now has a cleaner conceptual stack:

- graph VM: `pi`
- node runner: the Pi-backed per-node execution adapter
- model provider: OpenRouter or another model provider inside the Pi profile
- node session: the persisted agent session for one materialized node

That keeps single-run portability and model-provider selection from being
confused with the reactive graph runtime.

## Tests Run

- `bun run typecheck`
- `bun test test/node-runner-registry.test.ts test/node-runner-protocol.test.ts test/pi-node-runner.test.ts test/scripted-pi-session.test.ts test/run-entrypoint.test.ts test/runtime-control.test.ts test/hosted-contract-fixtures.test.ts`
- `bun test test/runtime-materialization.test.ts`
- `bun test`
- `bun run confidence:runtime`
- `bun run smoke:binary`

## Test Results

- Focused node-runner/runtime tests: 48 pass, 1 live Pi skip.
- Runtime materialization tests: 14 pass.
- Full suite: 230 pass, 1 live Pi skip, 0 fail.
- Runtime confidence matrix: pass, 18 checks.
- Bun binary smoke: pass.

## Tests Not Run

- Live Pi inference remained opt-in/skipped. This slice was a vocabulary and
  protocol cleanup over deterministic scripted Pi and local runtime evidence.

## Next Slice

- Continue package cleanup with the remaining low-level naming and API polish:
  decide whether to rename the `provider` wording that still appears in graph
  wiring/compiler diagnostics, where it means "component that provides an
  output" rather than runtime provider.

## Design Learnings

- The `provider` word was doing too many jobs. Keeping it only for model
  providers and ordinary graph edge prose makes the runtime easier to explain.
- Remote envelopes and traces are language design surfaces too; `graph_vm` and
  `node_session` make the React-like materialization model visible in the
  evidence users inspect.
- A separate `nodeRunner` injection point preserves testability without
  teaching users that arbitrary model providers are graph VMs.
