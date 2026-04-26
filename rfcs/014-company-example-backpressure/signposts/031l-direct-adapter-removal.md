# 031l Direct Adapter Removal

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `refactor: remove direct runtime adapters`

## What Changed

- Removed the direct OpenAI-compatible/OpenRouter provider adapter.
- Removed the local-process provider adapter.
- Removed their focused tests and the co-package local-process smoke.
- Shrunk the provider protocol's built-in kind list so `pi` is the only
  implemented graph VM kind in source.
- Kept helpful registry/CLI rejection paths for `openrouter`,
  `openai_compatible`, `local_process`, and `local-process` so users are still
  told which layer those names belong to.
- Updated RFC 013 phase docs to mark fixture/local-process provider work as
  superseded scaffolding and to point deterministic testing at scripted Pi.
- Updated std composite docs to describe scripted Pi graph execution rather
  than fixture/provider execution.

## Why It Matters

This is a deliberate "ideal form" cleanup: OpenRouter and OpenAI-compatible
endpoints are model-provider configuration inside Pi, not OpenProse graph
runtimes. Local process execution was useful scaffolding, but it is neither an
agent harness nor the Pi-backed reactive meta-harness. Removing both keeps the
OSS package centered on one clear runtime story while preserving room for
future real single-run harness adapters.

## Tests Run

- `bun run typecheck`
- `bun test test/provider-registry.test.ts test/runtime-profiles.test.ts test/co-package.test.ts test/provider-protocol.test.ts test/run-entrypoint.test.ts test/cli-ux.test.ts`
- `bun test`
- `bun run confidence:runtime`

## Test Results

- Focused provider/runtime/CLI/co-package tests: 43 pass.
- Full suite: 229 pass, 1 skip, 0 fail.
- Runtime confidence matrix: pass, 18 checks.

## Tests Not Run

- Live Pi inference stayed opt-in/skipped. This slice deleted non-Pi direct
  adapters and did not need live model spend.

## Next Slice

- Continue with either semantic golden company snapshots or a naming cleanup
  that narrows the remaining internal `provider` vocabulary toward "node
  execution" and "graph VM" where it materially improves clarity.

## Design Learnings

- Keeping "not yet ideal" adapters around creates conceptual gravity. It makes
  the package look more generic while actually weakening the core runtime
  message.
- The right split is now crisp: Pi graph VM for reactive graphs, scripted Pi
  for deterministic local backpressure, model providers configured inside Pi,
  and future single-run harness adapters only after they prove a clean SDK or
  process boundary.
