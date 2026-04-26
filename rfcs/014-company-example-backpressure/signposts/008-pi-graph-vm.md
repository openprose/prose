# 008 Pi Graph VM Boundary

Date: 2026-04-26
Branch: `rfc/reactive-openprose`
Commit target: `feat: execute graph nodes through pi vm`

## What Changed

- Added the first explicit graph execution boundary:
  - `ReactiveGraphRuntime`
  - `NodeExecutionRequest`
  - `NodeExecutionResult`
  - `PiGraphRuntime`
- Routed multi-node graph execution through `ctx.graphRuntime.executeNode(...)` instead of calling `ctx.provider.execute(...)` directly from the graph loop.
- Kept single-component execution on the existing provider boundary for now, preserving single-run harness portability while the graph path moves toward the Pi-backed meta-harness.
- Added node-specific workspaces under each graph run:

  ```text
  <run-dir>/nodes/<component-id>/workspace/
  ```

- Ensured scripted Pi sessions now create their `.pi/<session>.jsonl` path so tests can verify persisted session placement.
- Preserved current/reused graph behavior: if the graph is current, OpenProse returns prior run materializations without selecting or invoking a provider.

## Testing

- `bun run typecheck`
- `bun test test/run-entrypoint.test.ts test/runtime-control.test.ts test/scripted-pi-session.test.ts`
- `bun test`

Result: all local checks pass. Full suite: 186 pass, 2 skipped live-provider tests, 0 fail.

## Notable Learning

The runtime is now visibly split in code the way the north star describes it:

- A provider/harness can still execute one request.
- The graph runtime owns node execution as a distinct coordination layer.

This is still a wrapper over the existing Pi provider, but it creates the seam the next slices need for deterministic node prompt envelopes, structured output submission, Pi event normalization, and retry/cancel semantics.

## Next Slice

Phase 02.4 should define the deterministic Pi node prompt envelope. It should include component identity, typed inputs, upstream run refs, prior materializations, declared outputs, policy/effect constraints, stale reason, recompute scope, and acceptance/eval criteria.
